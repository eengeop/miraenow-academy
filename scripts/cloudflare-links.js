import { randomBytes } from 'node:crypto';
import { execFile } from 'node:child_process';
import { appendFile, mkdir } from 'node:fs/promises';
import { promisify } from 'node:util';
import { hashToken, linkLifetimeMs } from '../cloudflare/link-store.js';
import { issueSql, revokeSql, validateNoticeId } from '../cloudflare/operator-sql.js';

const run = promisify(execFile);
const [action, id] = process.argv.slice(2);
if (!['revoke', 'issue'].includes(action) || !id) {
  console.error('Usage: npm run cloudflare:links -- <revoke|issue> <notice-id>');
  process.exitCode = 1;
} else {
  try {
    validateNoticeId(id);
    const wrangler = 'node_modules/wrangler/bin/wrangler.js';
    async function execute(sql) {
      const { stdout } = await run(process.execPath, [wrangler, 'd1', 'execute', 'miraenow-notices-demo',
        '--remote', '--command', sql, '--json', '--yes'], { maxBuffer: 1024 * 1024 });
      const results = JSON.parse(stdout);
      if (!Array.isArray(results) || results.some((item) => !item.success)) {
        throw new Error('Remote D1 command failed');
      }
      return results;
    }

    if (action === 'revoke') {
      const results = await execute(revokeSql(id));
      console.log(`Revoked active links for notice ${id}: ${results[0]?.meta?.changes || 0}`);
    } else {
      const now = Date.now();
      const notice = (await execute(`SELECT expires_at AS expiresAt FROM notices WHERE id = '${id}'`))[0]?.results?.[0];
      if (!notice || notice.expiresAt <= now) throw new Error('Unknown or expired notice');
      const token = randomBytes(32).toString('base64url');
      const digest = await hashToken(token);
      const expiresAt = Math.min(now + linkLifetimeMs, notice.expiresAt);
      await execute(issueSql(id, digest, now, expiresAt));
      const active = (await execute(`SELECT active FROM links WHERE digest = '${digest}'`))[0]?.results?.[0];
      if (active?.active !== 1) throw new Error('New link was not activated');
      await mkdir('private', { recursive: true });
      await appendFile('private/cloudflare-issued-links.jsonl',
        `${JSON.stringify({ id, path: `/n/${token}`, expiresAt })}\n`, { mode: 0o600 });
      console.log(`Issued a new link for notice ${id}; saved only in private/cloudflare-issued-links.jsonl`);
    }
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
