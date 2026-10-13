import { readFile, writeFile, mkdir, readdir, stat } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { resolve, relative } from 'node:path';
import { createHash } from 'node:crypto';
import { keccak256, toHex } from 'viem';
const root = fileURLToPath(new URL('../../', import.meta.url));
const dist = resolve(root, 'dist');
const handoff = JSON.parse(await readFile(resolve(root, 'web/deployment/handoff.json'), 'utf8'));
const network = JSON.parse(await readFile(resolve(root, 'web/deployment/network.json'), 'utf8'));
const canonical = (value) => Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value;
const abiHash = (abi) => keccak256(toHex(JSON.stringify(canonical(abi)))).slice(2);
if (handoff.chainId !== network.network.chainId || parseInt(network.walletAddChain.chainId, 16) !== handoff.chainId) throw new Error('Network / handoff mismatch');
await mkdir(resolve(dist, 'abi'), { recursive: true });
const contracts = [];
for (const c of handoff.contracts) {
  const path = `docs/abi/${c.name}.json`;
  const bytes = execFileSync('git', ['show', `${handoff.sourceCommit}:${path}`], { cwd: root });
  const abi = JSON.parse(bytes.toString());
  if (!Array.isArray(abi) || abiHash(abi) !== c.abiHash) throw new Error(`Pinned ABI hash mismatch: ${c.name}`);
  if (!bytes.equals(await readFile(resolve(root, path)))) throw new Error(`Working ABI differs from deployed source: ${c.name}`);
  const abiPath = `abi/${c.name}.json`;
  await writeFile(resolve(dist, abiPath), bytes);
  contracts.push({ name: c.name, address: c.address, abiHash: c.abiHash, abiPath });
}
const assets = [];
async function walk(dir) {
  for (const name of (await readdir(dir)).sort()) {
    const file = resolve(dir, name);
    if ((await stat(file)).isDirectory()) await walk(file);
    else if (relative(dist, file) !== 'imd-deployment.json') assets.push({ path: relative(dist, file).split('\\').join('/'), sha256: createHash('sha256').update(await readFile(file)).digest('hex') });
  }
}
await walk(dist);
const manifest = { version: 1, launchId: handoff.launchId, chainId: handoff.chainId, sourceCommit: handoff.sourceCommit, attestationHash: handoff.attestationHash, contracts, assets, ...(handoff.poolKey ? { poolKey: handoff.poolKey } : {}), network: network.network, ...(network.walletAddChain ? { walletAddChain: network.walletAddChain } : {}) };
await writeFile(resolve(dist, 'imd-deployment.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log(`Exported ${contracts.length} pinned ABIs and ${assets.length} hashed assets.`);
