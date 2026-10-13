# Swarm Cats frontend

A one-page, static Sepolia mint site for the attested SwarmCats collection, with optional Loom trading, wallet holdings, transfers, approvals and owner setup. Source lives here; the complete production export is at `../dist/`. No backend, private key, WalletConnect ID, generated collection art or vendored registry is needed.

## Install, build and preview

Use Node.js 22.12+ (validated with Node 24.21.0) and npm. From the repository root:

```sh
npm --prefix web ci --cache /tmp/swarm-cats-npm
npm --prefix web run typecheck
npm --prefix web run build
node web/scripts/serve.mjs
```

Open `http://127.0.0.1:4173/preview/`. This preview deliberately serves a subpath, like an IPFS gateway. Stop the foreground server with Ctrl+C. `npm --prefix web run dev` supports source development after one production build; its middleware serves the same manifest and ABI files from `dist/` without a duplicate configuration. The production preview is the validation target. `npm --prefix web run preview` is also available.

The production build runs TypeScript, Vite, the pinned ABI exporter, and manifest verification. `base: './'`, local assets and hash anchors allow plain static hosting without rewrites. Do not edit `dist/` manually: rebuilding replaces it. Publish every file in `dist/` together.

## Deployment source of truth

`dist/imd-deployment.json` is the **only runtime deployment configuration**. `src/config.ts` fetches it relative to the page, reads its network settings and contracts, fetches every referenced ABI, checks canonical Keccak hashes, and creates the public/wallet clients. There is no parallel runtime address map.

`deployment/handoff.json` and `deployment/network.json` preserve the supplied inputs for reproducible builds after `.imd/reads/` is removed. They are build inputs, not separately fetched runtime configurations. `scripts/export.mjs` obtains each implementation-derived ABI with `git show <sourceCommit>:docs/abi/<Contract>.json`, verifies its recursively key-sorted, compact UTF-8 JSON Keccak hash against the handoff, and checks that the working ABI matches the pinned bytes. Keep the deployed source commit reachable when rebuilding. No contract compilation or contract-source changes are needed.

The exporter copies the exact contract set, identifiers, pool key, network and wallet-add-chain parameters. After Vite finishes it hashes every other exported file using SHA-256, excluding the manifest itself. `scripts/verify-export.mjs` checks the exact handoff binding, permitted top-level fields, safe paths, complete inventory, ABI hashes, asset hashes and size limits. Run it independently with `npm --prefix web run verify`.

Protocol interface fragments in `src/swap.ts` describe Uniswap v4, Permit2 and an external paired ERC-20. All protocol addresses come from the runtime network block. Calls involving the deployed Loom token use its loaded, hash-checked implementation ABI. Both swap tuple layouts are supported; `network.uniswapV4.extendedSwapParams` selects the extended layout.

## Wallets and transactions

- EIP-6963 browser-wallet discovery, with an injected `window.ethereum` fallback. Multiple discovered wallets can be selected. No project ID is invented. WalletConnect can be added later only with a supplied public project ID and an explicit configuration change.
- Public HTTP RPCs are tried in their supplied order. A connected wallet on the correct chain is the last read fallback. Wrong-chain RPC results or missing application contract code disable writes. Collection reads are refreshed every 15 seconds while visible, on connection/account changes, after receipts and on demand; requests do not overlap.
- The wrong-network action first switches, then offers the exact `wallet_addEthereumChain` parameters for error 4902/unknown chain, then switches again. Account and chain are checked again immediately before signing.
- Mint supply, fee, caps, provenance, pause state and lifetime allowance come from the collection. The mint action re-reads them and simulates the exact payable call. Every write is simulated before a wallet request. Per-action status covers simulation, signature, receipt, error and confirmation; a shared lock prevents concurrent signatures or duplicate sends.
- Receipt uncertainty retains the transaction lock and exposes **Check confirmation** plus the explorer link. A replaced/cancelled transaction is distinguished from the requested action. If the page is reloaded, inspect any pending transaction in the wallet/explorer before submitting again; pending state is not persisted across reloads.
- Owner-only controls cover provenance, both metadata URIs, oracle seed, freeze, pause/unpause, fee-paying reserve mint, ownership nomination/cancellation/acceptance and renunciation. Freeze requires an explicit acknowledgement; renunciation requires typing `RENOUNCE`. One-way settings disable after completion. The contract, not the interface, enforces authority.
- The collection is not enumerable. **Load my cats** reads `balanceOf`, `ownerOf` and `tokenURI` at one block, in bounded batches of 40 IDs, stopping when the balance is satisfied. It includes received/transferred NFTs and supports cancellation. A wallet owning a high token ID can require scanning up to 10,000 IDs. It runs on request, not on every poll. Metadata links use only HTTPS or IPFS; no collection imagery is fabricated or fetched through an invented gateway.
- Transfers use safe ERC-721 transfer for owned cats; per-token and operator approval/revocation are available. Loom transfer and allowance updates are also available. Zero-address values are used only for the protocol's native currency, genuine unset state and explicit revocation/cancellation semantics, never as invented deployment or recipient values.

## Loom trading

The actual handoff is `evm_project` and contains Loom plus a pool key, despite a later sentence in the workflow mentioning a collection-only launch. The site follows the attested deployed set and keeps minting as the primary task. Loom is not required to mint a Swarm Cat.

Trading checks code for the configured protocol contracts, pool initialization and active liquidity. A missing vetted configuration or zero active liquidity disables trading with an explanation. Quotes use `simulateContract` on the configured quoter, never a transaction. Input decimals are exact, slippage is explicit, quotes expire after 60 seconds and edits/account changes invalidate them. Minimum output is rounded down in base units.

Native input sends the exact amount as ETH without approvals. ERC-20 input first checks current token and Permit2 allowances, then presents only the necessary step: token approval to Permit2, Permit2 approval to the configured router, or swap. Each approval is limited to the input amount; the Permit2 permission expires after one hour and is re-read after confirmation. Swap execution uses command `0x10`, actions `0x060c0f`, the unchanged handoff pool key and a ten-minute deadline. The router execution is simulated before signing. There is no USD feed, so the interface reports token units and explicitly says USD context is unavailable.

## Validation

```sh
PLAYWRIGHT_BROWSERS_PATH=/tmp/swarm-cats-browsers web/node_modules/.bin/playwright install chromium webkit
PLAYWRIGHT_BROWSERS_PATH=/tmp/swarm-cats-browsers npm --prefix web test
node web/scripts/live-check.mjs
```

The browser suite serves the completed export under `/preview/` and uses isolated, ABI-aware mocked wallet/RPC responses. It never sends real transactions. Browser output goes to `test/scratch/`; the final JSON report and selected screenshots go to `docs/frontend/`. On a standard host, install Playwright's system dependencies as documented by Playwright. This worker needed additional WebKit shared libraries under `/tmp`; the exact worker setup and actual outcomes are recorded in `../docs/VALIDATION.md`.

The assigned design probe, while the pinned input exists:

```sh
IMD_PLAYWRIGHT="$PWD/web/node_modules/playwright/index.mjs" \
PLAYWRIGHT_BROWSERS_PATH=/tmp/swarm-cats-browsers \
node .imd/reads/skills/design-critic/scripts/taste.mjs --out test/scratch/taste
```

`scripts/live-check.mjs` performs read-only chain/code/state checks and records their timestamp. Its results are observations, not proof of successful live mints, approvals or swaps. See `../docs/VALIDATION.md` for final checks and limitations, and `../docs/DESIGN.md` for the implemented design.

## Assets and submission scope

The social image is a local typographic share card, not NFT art. `scripts/share.mjs` can regenerate it with Playwright (`CHROMIUM_PATH` optionally selects a browser executable), followed by a full production rebuild. Space Grotesk font files are local WOFF2 assets; their license is included in the export. The final hostname is assigned after delivery, so social metadata uses relative asset paths and must be tested again on the published URL.

Only `web/**`, `dist/**` and `docs/**` are delivery paths. The explicit `web/.gitignore` allowance excludes dependency/cache/test-report directories at every nested level under `web/`. No other ignore file is changed. Root `DESIGN.md` conflicts with the higher-priority path restriction; the design record is therefore delivered at `docs/DESIGN.md`. Publication, IPFS pinning, named URLs and live transaction broadcasting are outside this worker assignment.
