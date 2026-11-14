import { randomBytes } from 'node:crypto';
import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const defaultManagedRoot = fileURLToPath(new URL('../private/managed/', import.meta.url));
export const managedLifetimeMs = 30 * 24 * 60 * 60 * 1000;
const maxFileBytes = 30 * 1024 * 1024;
const formats = {
  'image/png': { extension: 'png', type: 'image' },
  'image/jpeg': { extension: 'jpg', type: 'image' },
  'application/pdf': { extension: 'pdf', type: 'pdf' },
};

function detectFormat(bytes) {
  if (bytes.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex'))) return 'image/png';
  if (bytes.subarray(0, 3).equals(Buffer.from('ffd8ff', 'hex'))) return 'image/jpeg';
  if (bytes.subarray(0, 5).toString('ascii') === '%PDF-') return 'application/pdf';
  throw new Error('Only PNG, JPG and PDF files can be registered');
}

async function readCatalog(root) {
  try {
    const catalog = JSON.parse(await readFile(join(root, 'notices.json'), 'utf8'));
    if (catalog.version !== 1 || !Array.isArray(catalog.notices)) throw new Error('Invalid notice catalog');
    return catalog;
  } catch (error) {
    if (error.code === 'ENOENT') return { version: 1, notices: [] };
    throw error;
  }
}

async function writeCatalog(root, catalog) {
  await mkdir(root, { recursive: true });
  const temporary = join(root, `notices.${process.pid}.${randomBytes(4).toString('hex')}.tmp`);
  await writeFile(temporary, `${JSON.stringify(catalog, null, 2)}\n`, { mode: 0o600 });
  await rename(temporary, join(root, 'notices.json'));
}

export async function registerManagedNotice(sourcePath, root = defaultManagedRoot, now = Date.now()) {
  const bytes = await readFile(sourcePath);
  if (!bytes.length || bytes.length > maxFileBytes) throw new Error('Notice file must be 1 byte to 30 MB');
  const mime = detectFormat(bytes);
  const { extension } = formats[mime];
  const id = randomBytes(16).toString('base64url');
  const file = join(root, 'files', `${id}.${extension}`);
  await mkdir(join(root, 'files'), { recursive: true });
  await writeFile(file, bytes, { flag: 'wx', mode: 0o600 });
  const registeredAt = new Date(now).toISOString();
  const expiresAt = new Date(now + managedLifetimeMs).toISOString();
  try {
    const catalog = await readCatalog(root);
    catalog.notices.push({ id, mime, registeredAt, expiresAt });
    await writeCatalog(root, catalog);
  } catch (error) {
    await unlink(file);
    throw error;
  }
  return { id, registeredAt, expiresAt };
}

export async function getManagedNoticeRegistration(id, root = defaultManagedRoot) {
  if (!/^[A-Za-z0-9_-]{22}$/.test(id)) return null;
  const catalog = await readCatalog(root);
  return catalog.notices.find((entry) => entry.id === id) || null;
}

export async function getManagedNotice(id, root = defaultManagedRoot, now = Date.now()) {
  if (!/^[A-Za-z0-9_-]{22}$/.test(id)) return null;
  const catalog = await readCatalog(root);
  const record = catalog.notices.find((entry) => entry.id === id);
  const format = formats[record?.mime];
  if (!format || !Number.isFinite(Date.parse(record.expiresAt)) || Date.parse(record.expiresAt) <= now) return null;
  return {
    type: format.type,
    mime: record.mime,
    file: join(root, 'files', `${id}.${format.extension}`),
    expiresAt: record.expiresAt,
    managed: true,
  };
}

export async function purgeManagedNotices(root = defaultManagedRoot, now = Date.now()) {
  const catalog = await readCatalog(root);
  const remaining = [];
  let purged = 0;
  for (const record of catalog.notices) {
    if (Number.isFinite(Date.parse(record.expiresAt)) && Date.parse(record.expiresAt) > now) {
      remaining.push(record);
      continue;
    }
    const format = formats[record.mime];
    if (!format || !/^[A-Za-z0-9_-]{22}$/.test(record.id)) throw new Error('Invalid managed notice');
    try {
      await unlink(join(root, 'files', `${record.id}.${format.extension}`));
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
    purged += 1;
  }
  if (purged) await writeCatalog(root, { version: 1, notices: remaining });
  return purged;
}
