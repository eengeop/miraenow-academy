import { issueLink, revokeLink, notices } from '../lib/links.js';

const [command, id] = process.argv.slice(2);

if (!['issue', 'revoke'].includes(command) || !notices.has(id)) {
  console.error('Usage: npm run links -- <issue|revoke> <sample-a|sample-b>');
  process.exitCode = 1;
} else if (command === 'issue') {
  const token = await issueLink(id);
  const base = process.env.BASE_URL || 'http://localhost:3000';
  console.log(new URL(`/n/${token}`, base).href);
} else {
  const revoked = await revokeLink(id);
  console.log(revoked ? `${id}: link revoked` : `${id}: no active link`);
}
