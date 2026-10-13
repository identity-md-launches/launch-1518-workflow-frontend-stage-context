import { execFileSync } from 'node:child_process';
import { lstat, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
const root = fileURLToPath(new URL('../../', import.meta.url));
const files = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'], { cwd: root }).toString().split('\0').filter(Boolean);
const changed = execFileSync('git', ['diff', '--name-only', 'HEAD', '-z'], { cwd: root }).toString().split('\0').filter(Boolean);
const newFiles = execFileSync('git', ['ls-files', '--others', '--exclude-standard', '-z'], { cwd: root }).toString().split('\0').filter(Boolean);
const allowed = p => /^(web|dist|docs)\//.test(p) && (!p.split('/').some(part => part.startsWith('.')) || p === 'web/.gitignore');
const forbidden = [...new Set([...changed, ...newFiles])].filter(p => !allowed(p));
if (forbidden.length) throw new Error(`Out-of-scope changes: ${forbidden.join(', ')}`);
const disallowedPackaging = files.filter(p => /(^|\/)(node_modules|\.npm|\.cache|\.vite|vendor\/npm)(\/|$)|\.tgz$/.test(p));
if (disallowedPackaging.length) throw new Error(`Dependency/cache packaging: ${disallowedPackaging.join(', ')}`);
const submodules = execFileSync('git', ['ls-files', '--stage'], { cwd: root }).toString().split('\n').filter(p => p.startsWith('160000 '));
if (submodules.length) throw new Error('Submodules remain');
let total = 0, scoped = 0;
for (const path of [...new Set(files)]) {
  const info = await lstat(resolve(root, path));
  if (!info.isFile()) throw new Error(`Unexpected non-file in submission: ${path}`);
  total += info.size;
  if (/^(web|dist|docs)\//.test(path)) scoped += info.size;
}
const manifest = JSON.parse(await readFile(resolve(root, 'dist/imd-deployment.json'), 'utf8'));
const exportBytes = (await Promise.all([...manifest.assets.map(a => a.path), 'imd-deployment.json'].map(p => lstat(resolve(root, 'dist', p))))).reduce((sum, s) => sum + s.size, 0);
// The raw complete file tree plus the existing compressed Git history is a deliberately
// conservative preflight. The actual full Git bundle is measured in a disposable clone.
const result = { checkedAt: new Date().toISOString(), uncompressedTreeBytes: total, scopedBytes: scoped, exportBytes, assets: manifest.assets.length, permittedPathsOnly: true, dependencyCachesExcluded: true, submodules: 0, maxSubmissionBytes: 8388608 };
if (total >= 8388608) throw new Error(`Raw file tree exceeds the submission budget: ${total}`);
await writeFile(resolve(root, 'docs/frontend/submission-budget.json'), JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify(result, null, 2));
