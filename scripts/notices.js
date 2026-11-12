import { realpath } from 'node:fs/promises';
import { isAbsolute, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { purgeManagedNotices, registerManagedNotice } from '../lib/managed-notices.js';

const [command, file] = process.argv.slice(2);
if (command === 'register' && file) {
  const uploads = await realpath(fileURLToPath(new URL('../uploads/', import.meta.url)));
  const source = await realpath(file);
  const inside = relative(uploads, source);
  if (!inside || inside === '..' || inside.startsWith(`..${sep}`) || isAbsolute(inside)) {
    throw new Error('Register a file inside uploads/');
  }
  const notice = await registerManagedNotice(source);
  console.log(`Registered notice ID: ${notice.id}`);
  console.log(`Managed copy expires: ${notice.expiresAt}`);
} else if (command === 'purge' && !file) {
  console.log(`Deleted expired managed copies: ${await purgeManagedNotices()}`);
} else {
  console.error('Usage: npm run notices -- <register uploads/file.png|purge>');
  process.exitCode = 1;
}
