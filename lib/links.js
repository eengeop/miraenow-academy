import { createHash, randomBytes } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

export const defaultRegistryPath = fileURLToPath(new URL('../private/links.json', import.meta.url));

export const notices = new Map([
  ['sample-a', new URL('../samples/notice-a.svg', import.meta.url)],
  ['sample-b', new URL('../samples/notice-b.svg', import.meta.url)],
]);

const digest = (token) => createHash('sha256').update(token).digest('hex');

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

function assertNotice(id) {
  if (!notices.has(id)) throw new Error('Unknown sample notice');
}

export async function issueLink(id, path = defaultRegistryPath) {
  assertNotice(id);
  const registry = await readRegistry(path);
  for (const link of registry.links) {
    if (link.id === id) link.active = false;
  }
  const token = randomBytes(32).toString('base64url');
  registry.links.push({ id, digest: digest(token), active: true });
  await writeRegistry(path, registry);
  return token;
}

export async function revokeLink(id, path = defaultRegistryPath) {
  assertNotice(id);
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

export async function resolveLink(token, path = defaultRegistryPath) {
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
  const registry = await readRegistry(path);
  const link = registry.links.find((entry) => entry.active && entry.digest === digest(token));
  return link && notices.has(link.id) ? link.id : null;
}
