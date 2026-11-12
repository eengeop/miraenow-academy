import { cp, mkdir, rm } from 'node:fs/promises';

await rm('dist', { recursive: true, force: true });
await mkdir('dist');
for (const name of ['index.html', 'styles.css', 'app.js', 'sample-notice.svg']) {
  await cp(`src/${name}`, `dist/${name}`);
}
console.log('Built static sample in dist/');
