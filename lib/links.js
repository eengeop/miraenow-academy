import { createHash, randomBytes } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defaultManagedRoot, getManagedNotice } from './managed-notices.js';

export const defaultRegistryPath = fileURLToPath(new URL('../private/links.json', import.meta.url));

export const notices = new Map([
  ['sample-a', { type: 'image', file: new URL('../samples/notice-a.svg', import.meta.url) }],
  ['sample-b', { type: 'image', file: new URL('../samples/notice-b.svg', import.meta.url) }],
  ['sample-pdf', { type: 'pdf' }],
  ['local-image', { type: 'image', file: new URL('../uploads/testImage2.png', import.meta.url), mime: 'image/png' }],
]);

const digest = (token) => createHash('sha256').update(token).digest('hex');
export const linkLifetimeMs = 30 * 24 * 60 * 60 * 1000;

async function readRegistry(path) {
  try {
    const registry = JSON.parse(await readFile(path, 'utf8'));
    if (registry.version !== 1 || !Array.isArray(registry.links)) {
      throw new Error('Invalid link registry');
    }
    return registry;
  } catch (error) {
    if (error.code === 'ENOENT') return { version: 1, links: [] };
    throw error;
  }
}

async function writeRegistry(path, registry) {
  await mkdir(dirname(path), { recursive: true });
  const temporaryPath = `${path}.${process.pid}.${randomBytes(4).toString('hex')}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(registry, null, 2)}\n`, { mode: 0o600 });
  await rename(temporaryPath, path);
}

async function findNotice(id, managedRoot, now) {
  return notices.get(id) || await getManagedNotice(id, managedRoot, now);
}

export async function issueLink(id, path = defaultRegistryPath, now = Date.now(), managedRoot = defaultManagedRoot) {
  const notice = await findNotice(id, managedRoot, now);
  if (!notice) throw new Error('Unknown or expired notice');
  const registry = await readRegistry(path);
  for (const link of registry.links) {
    if (link.id === id) link.active = false;
  }
  const token = randomBytes(32).toString('base64url');
  const expiresAt = Math.min(now + linkLifetimeMs, notice.expiresAt ? Date.parse(notice.expiresAt) : Infinity);
  registry.links.push({
    id,
    digest: digest(token),
    active: true,
    expiresAt: new Date(expiresAt).toISOString(),
  });
  await writeRegistry(path, registry);
  return token;
}

export async function revokeLink(id, path = defaultRegistryPath) {
  const registry = await readRegistry(path);
  let revoked = false;
  for (const link of registry.links) {
    if (link.id === id && link.active) {
      link.active = false;
      revoked = true;
    }
  }
  if (revoked) await writeRegistry(path, registry);
  return revoked;
}

export async function resolveLink(token, path = defaultRegistryPath, now = Date.now(), managedRoot = defaultManagedRoot) {
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
  const registry = await readRegistry(path);
  const link = registry.links.find((entry) =>
    entry.active && entry.digest === digest(token) && Date.parse(entry.expiresAt) > now);
  return link && await findNotice(link.id, managedRoot, now) ? link.id : null;
}
