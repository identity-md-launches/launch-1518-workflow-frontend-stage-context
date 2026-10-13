import { readFile, readdir, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve, relative } from 'node:path';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { keccak256, toHex } from 'viem';
const root = fileURLToPath(new URL('../../', import.meta.url));
const dist = resolve(root, 'dist');
const json = async p => JSON.parse(await readFile(resolve(root, p), 'utf8'));
const manifest = await json('dist/imd-deployment.json');
const handoff = await json('web/deployment/handoff.json');
const network = await json('web/deployment/network.json');
const canonical = x => Array.isArray(x) ? x.map(canonical) : x && typeof x === 'object' ? Object.fromEntries(Object.keys(x).sort().map(k => [k, canonical(x[k])])) : x;
const safe = p => typeof p === 'string' && /^[a-zA-Z0-9_./-]+$/.test(p) && !p.startsWith('/') && !p.split('/').some(x => x === '..' || x === '.') && !p.includes('://');
const allowed = ['version', 'launchId', 'chainId', 'sourceCommit', 'attestationHash', 'contracts', 'assets', 'poolKey', 'network', 'walletAddChain'];
assert(Object.keys(manifest).every(k => allowed.includes(k)), 'Extra manifest keys');
for (const k of ['version', 'launchId', 'chainId', 'sourceCommit', 'attestationHash']) assert.deepEqual(manifest[k], handoff[k], k);
assert.deepEqual(manifest.poolKey, handoff.poolKey);
assert.deepEqual(manifest.network, network.network);
assert.deepEqual(manifest.walletAddChain, network.walletAddChain);
assert.equal(manifest.contracts.length, handoff.contracts.length);
for (const [i, c] of manifest.contracts.entries()) {
  const expected = handoff.contracts[i];
  for (const k of ['name', 'address', 'abiHash']) assert.equal(c[k], expected[k]);
  assert(safe(c.abiPath));
  const abi = await json(`dist/${c.abiPath}`);
  assert(Array.isArray(abi));
  assert.equal(keccak256(toHex(JSON.stringify(canonical(abi)))).slice(2), c.abiHash);
}
const files = [];
let total = 0;
async function walk(dir) {
  for (const name of await readdir(dir)) {
    const path = resolve(dir, name); const info = await stat(path);
    if (info.isDirectory()) await walk(path);
    else { assert(info.size <= 8388608); total += info.size; if (name !== 'imd-deployment.json') files.push(relative(dist, path).split('\\').join('/')); }
  }
}
await walk(dist);
assert(manifest.assets.length <= 128);
assert(total < 32 * 1024 * 1024);
assert.deepEqual(manifest.assets.map(a => a.path).sort(), files.sort());
assert(files.includes('index.html'));
for (const a of manifest.assets) {
  assert(safe(a.path)); assert(/^[a-f0-9]{64}$/.test(a.sha256));
  assert.equal(createHash('sha256').update(await readFile(resolve(dist, a.path))).digest('hex'), a.sha256, a.path);
}
console.log(JSON.stringify({ verified: true, assets: files.length, exportBytes: total, contracts: manifest.contracts.map(c => c.name), sourceCommit: manifest.sourceCommit }, null, 2));
