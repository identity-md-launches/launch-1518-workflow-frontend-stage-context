# Frontend validation

Worker evidence for the Swarm Cats frontend, tested on 2026-10-13. These are local checks by the implementing worker, not an independent review or publication certification. No real wallet transaction was broadcast, no contract was redeployed and no site was published.

## Final results

| Check | Outcome |
| --- | --- |
| Clean `npm ci` | Passed; exact lockfile installation, 42 packages, zero audit vulnerabilities at the recorded run |
| Strict TypeScript + production build | Passed, exit 0; `frontend/build.log` |
| Rebuild reproducibility | SHA-256 of the complete deployment manifest unchanged after clean reinstall/rebuild |
| Browser interactions | **60/60 passed**, 30 Chromium + 30 WebKit, zero skipped/flaky/unexpected; final run 06:41:54 UTC, 125.947 seconds; `frontend/interactions.json` and `frontend/browser-tests.log` |
| taste@1 rendered probe | **16/16 passed**; final measurements include the fully rendered mobile and desktop page; `frontend/taste-checks.json` |
| Mobile first screen | Product, wallet control, supply, fee, quantity and main action visibly present at 390 × 844; `frontend/mobile-live.png` |
| Reflow stress | Passed at 320, 390, 760 and 1440; 200% text enlargement at 320 also passed in both engines |
| Export/configuration integrity | Passed: 12 assets plus manifest, 696,325 total bytes; all hashes, pool key, network fields and contract bindings match |
| Live RPC/code reads | Passed for all three RPC chain IDs and both application contracts; read-only observations below |
| Complete Git bundle | Verified with `git bundle verify` in a disposable committed clone; complete history plus source/export/evidence is below 1 MiB, well below the 8 MiB cap; no bundle archive is added to the submission |
| Source preservation and scope | Protected-source diff empty; no submodule, dependency directory, registry archive or out-of-scope deliverable |

Selected evidence includes `frontend/desktop-live.png`, `frontend/mobile-live.png`, and both `frontend/chromium-mobile-connected.png` and `frontend/webkit-mobile-connected.png` (the latter two intentionally use labelled test fixtures). The screenshot images were opened and inspected. The share image was also visually inspected. The probe measured at most six font sizes on desktop, five on mobile, one family and three weights; all measured text passed its contrast thresholds and both phone widths had no overflow. Three inline controls were below the preferred 44px size but passed the probe's spacing/baseline target rules.

## Scope and consequential decisions

The deployed source is `bb2ad3a7587d9da2678842e457e610da610fa61f`. Both implementation-derived ABI exports were read from that exact Git commit and their canonical Keccak hashes matched the handoff. The application loads `dist/imd-deployment.json` and the ABIs it names; its network, contract addresses and pool key have no separate runtime map. The actual attested handoff is an `evm_project` containing Loom and SwarmCats, so optional Loom trading is included below the primary NFT mint flow despite the collection-only sentence at the end of the workflow.

The path restriction takes precedence over the request for root `DESIGN.md`: the design document is at `docs/DESIGN.md`. Only the explicitly permitted `web/.gitignore` was added; its patterns exclude dependencies and generated caches at every depth under `web/`. Root build files, deployed contract source, implementation ABI source files, dependency libraries and GitHub configuration were preserved.

## Requirements coverage

| Requirement | Result and evidence |
| --- | --- |
| Vite/React/TypeScript source, manifest, lockfile and build config under `web/` | Implemented. Production build includes a strict TypeScript check. |
| Complete static export in root `dist/`, relative paths and no rewrites | Implemented; tested through `/preview/`, including metadata and local font loading. |
| Wallet connection, chain switching, missing-chain addition | EIP-6963 and injected provider support; wrong-chain/add-chain and rejection paths tested in both browser engines. |
| Supply, protocol fee, quantity 1–5 and payable mint | Live reads, lifetime-limit gates and exact quantity × fee; decoded mock transaction checked against the deployed ABI. |
| Show wallet's tokens and contract explorer links | Consistent-block ownership scan includes received NFTs; IDs, metadata links and empty metadata states tested. Full addresses include copy/explorer controls. |
| Owner setup and primary contract controls | Provenance, metadata, seed, freeze, pause/resume, reserve mint, ownership and transfer/approval controls implemented. Core owner actions and permanence gates exercised with mocked state. |
| Safe, configured swaps and approvals | Exact network addresses and unchanged pool key; quote, slippage minimum, command/action encoding, native value, both ERC-20 approval steps, expiry and liquidity gates tested. |
| Runtime deployment manifest and implementation ABIs | Exact handoff binding, canonical ABI hashes and every asset SHA-256 verified by `scripts/verify-export.mjs`. Tampered ABI blocks bootstrap in browser tests. |
| Live observability and transaction feedback | Block/update time, retry, pause/configuration messages, wallet identity, per-action status, decoded errors and transaction explorer links. Writes remain locked through receipt uncertainty. |
| Mobile first screen and narrow reflow | Main mint/wallet action visible at 390 × 844. 320/390/760/1440 stress checks include full addresses, very large balances and an open wallet disclosure. 200% text enlargement at 320 checked separately. |
| Metadata | Title, description, favicon, `og:title`, `og:image` and Twitter card provided. The share image is local typography, not fabricated NFT art. |
| Six-domain interface review and design record | Pinned guides read and applied; coverage and repairs below. `docs/DESIGN.md` records actual source tokens/components. |
| Publication | After worker delivery. No published URL, named site or CID is asserted. |

## Commands and evidence

From the repository root:

```sh
npm --prefix web ci --cache /tmp/swarm-cats-npm
npm --prefix web run typecheck
npm --prefix web run build
npm --prefix web run verify
node web/scripts/serve.mjs
PLAYWRIGHT_BROWSERS_PATH=/tmp/swarm-cats-browsers npm --prefix web test
node web/scripts/live-check.mjs
IMD_PLAYWRIGHT="$PWD/web/node_modules/playwright/index.mjs" \
PLAYWRIGHT_BROWSERS_PATH=/tmp/swarm-cats-browsers \
node .imd/reads/skills/design-critic/scripts/taste.mjs --out test/scratch/taste
node web/scripts/submission-budget.mjs
```

The worker initially installed with `npm install --prefix web --cache /tmp/swarm-cats-npm`; the resulting exact dependency versions are locked. The ordinary npm cache was read-only, so `/tmp` was used. Node was 24.21.0 and npm 11.19.0. Installation reported zero vulnerabilities. Build output is retained in `frontend/build.log`. Vite emits a non-blocking warning for the approximately 559 kB uncompressed entry chunk (about 169 kB gzip); the entire export is under 0.7 MB.

Playwright 1.64.0 Chromium and WebKit were installed outside the submission at `/tmp/swarm-cats-browsers`. WebKit initially failed for missing shared libraries and then for the EGL display. Ubuntu packages were downloaded/extracted under `/tmp/swarm-cats-webkit-runtime`, linked into the temporary browser runtime, and Mesa was pointed at the extracted vendor file. No system directories or repository dependencies were vendored. The successful worker invocation adds:

```sh
MESA_SHADER_CACHE_DIR=/tmp/swarm-cats-shaders \
__EGL_VENDOR_LIBRARY_FILENAMES=/tmp/swarm-cats-webkit-runtime/usr/share/glvnd/egl_vendor.d/50_mesa.json \
LIBGL_DRIVERS_PATH=/tmp/swarm-cats-webkit-runtime/usr/lib/x86_64-linux-gnu/dri \
PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS=1 \
PLAYWRIGHT_BROWSERS_PATH=/tmp/swarm-cats-browsers \
npm --prefix web test
```

The host-library validator was skipped only after resolving the actual runtime dependencies; both engines actually launched and ran the interactions. The test suite uses one worker to keep browser resource use bounded. An earlier parallel run was interrupted after a fixture's constant block number prevented a delayed receipt from being observed; the fixture now advances blocks, and the pending-receipt case was rerun. Initial TypeScript wallet tuple errors were fixed before any successful build was reported.

Browser tests intercept only the configured public RPC URLs and install an isolated mock browser wallet. Writes are decoded by the real ABIs in the Node test process; they do not reach a real RPC. Assertions check exact destinations, quantities, values and encoded pool parameters. The test-only identities/URI strings are never included in the production export. A three-minute confirmation timeout is advanced with Playwright's virtual clock rather than waiting three real minutes.

The development middleware was also requested over HTTP: its manifest and both ABI responses matched production bytes exactly. It does not create a second configuration.

## Better Interface review

Idea: a warm paper-colored mint desk, with large collection typography and one clearly costed rust-colored action.

| Domain | Coverage |
| --- | --- |
| Accessibility | **Checked:** native elements, visible labels, heading/landmark order, skip link, persistent status/error regions, keyboard connect/quantity/mint, explicit focus styling, disabled prerequisites, target sizes, reduced motion and enlarged-text reflow. Screen-reader sessions, physical devices and browser-native zoom are **not verified**. |
| Layout | **Checked:** first-screen action at 390, normal-flow sections, disclosure affordances, 320/390/760/1440 widths, very large balances, full addresses, open wallet panel, 200% root text size. English layout only; RTL/localization are **not applicable** to this release. |
| Writing | **Checked:** action verbs, protocol fee vs gas, lifetime allowance, live vs unavailable state, owner setup, permanence, rejection/revert retry guidance, quote minimum/deadline and no invented fiat price. |
| Typography | **Checked:** local real font weights, one family, six-role maximum type scale, headline hierarchy, mobile field sizes, tabular numbers, wrapping and selectable full values. No truncation of critical values. |
| Colors | **Checked:** semantic source tokens and rendered text/background contrast in the design probe. Status uses words as well as color. Light-only presentation is intentional; another theme is **not applicable**. |
| UI | **Checked:** neutral secondary actions, one accent mint action, restrained borders, no nested card stack/shadow combination, loading/empty/pending/success/error/retry states, native disclosures, reduced-motion behavior. Custom dialogs and complex animation timelines are **not applicable**. |

### Findings, fixes and rechecks

| Finding | Source and reproduction | Fix and result |
| --- | --- | --- |
| Medium: mobile headline lost a word space | `web/src/App.tsx:81`; hiding the desktop line break rendered “yourSwarm” on the first 390 screenshot. | Added an explicit space between the break and following span. Headline text and final screenshots rechecked. |
| Medium: enlarged text caused narrow overflow | `web/src/styles.css:57`, `:87`, `:98`; at 320px with root font size 200%, measured document width was 369px, involving the header, quantity and refresh rows. | Allowed these three flex rows to wrap. Both engines' stress tests now measure no horizontal overflow, including 200% text enlargement. |
| High: a slow/all-failing RPC sequence could overlap refreshes | `web/src/App.tsx:27`; source review found that a 15-second poll could start while a multi-endpoint request was still running, invalidating every older result. | Added an in-flight guard and generation checks for account/provider changes. Failure and wallet-fallback tests pass. |
| High: uncertain receipt could allow duplicate submission | `web/src/wallet.ts:116`; source review found that a receipt failure after obtaining a hash released the write lock. | Retain the lock and hash, expose a status recheck, preserve replacement/cancellation meaning. Pending and accelerated-timeout tests confirm a single send and recovery after receipt arrival. |
| Medium: approval revocation lacked an explicit route | `web/src/CollectionTools.tsx:54`; nonzero-recipient validation prevented using the ERC-721 revocation operation. | Added an explicit revoke choice with no invented recipient input. Decoded transaction test verifies the protocol's zero-address revocation semantics. |
| Low: unused older font formats were exported | `web/src/fonts.css:1`; package CSS shipped both WOFF and WOFF2 despite the supported modern browsers. | Load only the three used WOFF2 faces and preserve the font license. Final manifest inventory is smaller and complete. |

No unresolved high or medium finding is known within the tested scope. Passing the automated probe does not establish every accessibility property or live-chain behavior.

## Live-chain observations

`frontend/live-chain.json` is a read-only, timestamped observation. All three supplied RPCs returned chain ID 11155111. LaunchToken had 1,722 bytes of code and SwarmCats had 8,415 bytes. Every configured Uniswap/Permit2 contract also had nonempty code.

The first check observed supply 0 with provenance and metadata unset. A later check at 06:24:52 UTC observed supply 5, provenance set, a nonempty IPFS base URI, no unrevealed URI, no reveal seed, and editable metadata. The pool was initialized with zero active liquidity. These changes were observed through read-only requests; this worker did not submit them. The UI derives these states live and permits no trade while active liquidity is zero.

## Limits and follow-up behavior

- No real mint, approval, swap, transfer or owner transaction was signed/broadcast. Successful simulations against funded live wallet accounts and live receipt/replacement behavior remain untested; the interaction suite uses mocks.
- Real browser-wallet extension popups, hardware wallets and WalletConnect were not tested. EIP-6963/injected integration is implemented; no supplied WalletConnect project ID exists.
- No screen-reader, physical iPhone/Android or native-browser 200% zoom session was performed. Root text enlargement and viewport emulation are separate, narrower checks.
- The current launch pool has no active liquidity, so no successful live swap can be claimed. Pool/quote failure messages are real gates, not simulated liquidity in the delivered page.
- Holdings enumerate current ownership without an indexer. Worst-case 10,000-ID lookup latency was not benchmarked against live RPC limits. The lookup is batched, cancelable and user initiated.
- Token URI links are shown without fetching arbitrary metadata or generating art. IPFS links require a compatible browser/gateway. Publication of the owner's assets and testing the final social unfurl are outside this worker's control.
- HTTP/ABI/code verification does not independently prove attestation signatures or exact runtime bytecode identity; the control plane performs the workflow's publication checks later. ABI hashes and supplied configuration binding are checked locally.
- No fiat price source is configured, so the app explicitly reports USD context unavailable. Relative Open Graph paths are retained until a published hostname exists.
- A pending transaction is not persisted across a full page reload; the README instructs checking the wallet/explorer before resubmission.

Final command counts, rendered probe results and packaging measurements accompany this document under `frontend/`. The complete bundle was measured using a disposable clone in `/tmp`; only nonignored scoped files were copied, committed and bundled with the base history. The archive remains outside the submission.

## Completion

Complete for the stated frontend worker scope, with the root design-document path relocated to honor the explicit write restriction. Live transactions, independent publication checks, hosted URLs and final social unfurl verification remain outside this worker result.
