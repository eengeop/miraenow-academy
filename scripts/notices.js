import { realpath } from 'node:fs/promises';
import { isAbsolute, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getManagedNoticeRegistration, purgeManagedNotices, registerManagedNotice } from '../lib/managed-notices.js';
import { confirmOriginalDeleted, listOriginals, recordOriginal } from '../lib/originals.js';

const [command, file, extra] = process.argv.slice(2);
async function uploadSource(path) {
  const uploads = await realpath(fileURLToPath(new URL('../uploads/', import.meta.url)));
  const source = await realpath(path);
  const inside = relative(uploads, source);
  if (!inside || inside === '..' || inside.startsWith(`..${sep}`) || isAbsolute(inside)) {
    throw new Error('Register a file inside uploads/');
  }
  return { uploads, source };
}

if (command === 'register' && file) {
  const { uploads, source } = await uploadSource(file);
  const sourceName = relative(uploads, source);
  if ((await listOriginals()).some((record) => record.source === sourceName)) {
    throw new Error('Original already has an open deletion record');
  }
  const notice = await registerManagedNotice(source);
  console.log(`Registered notice ID: ${notice.id}`);
  console.log(`Managed copy expires: ${notice.expiresAt}`);
  try {
    await recordOriginal(notice, source, uploads);
    console.log(`Original deletion due: ${notice.expiresAt}`);
  } catch (error) {
    console.error(`Original record failed: ${error.message}`);
    console.error(`Recover with: npm run notices -- record ${notice.id} <same-uploads-file>`);
    process.exitCode = 1;
  }
} else if (command === 'record' && file && extra) {
  const notice = await getManagedNoticeRegistration(file);
  if (!notice) throw new Error('Unknown managed notice ID');
  const { uploads, source } = await uploadSource(extra);
  await recordOriginal(notice, source, uploads);
  console.log(`Original deletion due: ${notice.expiresAt}`);
} else if (command === 'originals' && !file) {
  const records = await listOriginals();
  if (!records.length) console.log('No open original deletion records');
  for (const record of records) {
    console.log(`${record.due ? 'DUE' : 'PENDING'} ${record.id} uploads/${record.source} ${record.deleteAt}`);
  }
} else if (command === 'confirm-deleted' && file && !extra) {
  await confirmOriginalDeleted(file);
  console.log(`Confirmed original deleted for notice ${file}`);
} else if (command === 'purge' && !file) {
  console.log(`Deleted expired managed copies: ${await purgeManagedNotices()}`);
} else {
  console.error('Usage: npm run notices -- <register uploads/file.png|record notice-id uploads/file.png|originals|confirm-deleted notice-id|purge>');
  process.exitCode = 1;
}
