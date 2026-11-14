import { appendFile, mkdir, readFile, stat } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

export const defaultUploadsRoot = fileURLToPath(new URL('../uploads/', import.meta.url));
export const defaultOriginalsLedger = fileURLToPath(new URL('../private/originals.jsonl', import.meta.url));

function sourceName(source, uploadsRoot) {
  const name = relative(uploadsRoot, source);
  if (!name || name === '..' || name.startsWith(`..${sep}`) || isAbsolute(name)) {
    throw new Error('Original must be inside uploads/');
  }
  return name;
}

async function readEvents(ledgerPath) {
  try {
    const lines = (await readFile(ledgerPath, 'utf8')).trim();
    return lines ? lines.split('\n').map((line) => JSON.parse(line)) : [];
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }
}

function currentRecords(events) {
  const records = new Map();
  for (const event of events) {
    if (event.type === 'registered') records.set(event.id, { ...event, deletedAt: null });
    else if (event.type === 'deleted' && records.has(event.id)) records.get(event.id).deletedAt = event.at;
    else throw new Error('Invalid original ledger');
  }
  return [...records.values()];
}

async function appendEvent(ledgerPath, event) {
  await mkdir(dirname(ledgerPath), { recursive: true });
  await appendFile(ledgerPath, `${JSON.stringify(event)}\n`, { mode: 0o600 });
}

export async function recordOriginal(notice, source, uploadsRoot = defaultUploadsRoot, ledgerPath = defaultOriginalsLedger) {
  const name = sourceName(source, uploadsRoot);
  const records = currentRecords(await readEvents(ledgerPath));
  if (records.some((record) => record.id === notice.id)) throw new Error('Original already recorded for notice');
  if (records.some((record) => record.source === name && !record.deletedAt)) {
    throw new Error('Original already has an open deletion record');
  }
  if (!Number.isFinite(Date.parse(notice.registeredAt)) || !Number.isFinite(Date.parse(notice.expiresAt))) {
    throw new Error('Invalid registration dates');
  }
  await appendEvent(ledgerPath, {
    type: 'registered', id: notice.id, source: name,
    registeredAt: notice.registeredAt, deleteAt: notice.expiresAt,
  });
}

export async function listOriginals(ledgerPath = defaultOriginalsLedger, now = Date.now()) {
  return currentRecords(await readEvents(ledgerPath))
    .filter((record) => !record.deletedAt)
    .map((record) => ({ ...record, due: Date.parse(record.deleteAt) <= now }))
    .sort((a, b) => a.deleteAt.localeCompare(b.deleteAt));
}

export async function confirmOriginalDeleted(id, uploadsRoot = defaultUploadsRoot, ledgerPath = defaultOriginalsLedger, now = Date.now()) {
  const record = (await listOriginals(ledgerPath, now)).find((item) => item.id === id);
  if (!record) throw new Error('No open deletion record for notice');
  const source = join(uploadsRoot, sourceName(join(uploadsRoot, record.source), uploadsRoot));
  try {
    await stat(source);
    throw new Error('Original still exists in uploads/; delete it manually first');
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  await appendEvent(ledgerPath, { type: 'deleted', id, at: new Date(now).toISOString() });
}
