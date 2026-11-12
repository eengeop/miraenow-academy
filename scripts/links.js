import { issueLink, revokeLink, notices } from '../lib/links.js';
import { access } from 'node:fs/promises';

const [command, id] = process.argv.slice(2);

if (!['issue', 'revoke'].includes(command) || !notices.has(id)) {
  console.error('Usage: npm run links -- <issue|revoke> <sample-a|sample-b|sample-pdf|local-image>');
  process.exitCode = 1;
} else if (command === 'issue') {
  if (id === 'local-image') await access(notices.get(id).file);
  const token = await issueLink(id);
  const base = process.env.BASE_URL || 'http://127.0.0.1:3000';
  console.log(new URL(`/n/${token}`, base).href);
} else {
  const revoked = await revokeLink(id);
  console.log(revoked ? `${id}: link revoked` : `${id}: no active link`);
}
