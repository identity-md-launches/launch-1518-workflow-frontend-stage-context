# Swarm Cats design

This document describes the implemented site in `web/src/`. It lives in `docs/` because this assignment permits only `web/**`, `dist/**` and `docs/**`; the requested root `DESIGN.md` is outside that explicit budget.

## Intent and visual idea

A mint desk for a collection made by a swarm: oversized black typography, warm paper-colored space and one rust-colored mint action. The first screen contains the product, live supply, protocol fee, quantity and wallet action. No collection art was generated, approximated or substituted. The small cat outline is a navigation mark; the social image is typographic.

The single page orders minting first, wallet holdings second, collection information third, and optional Loom trading, owner setup and contract details below. Browser wallet and transaction state drive the interface. The page does not present manufactured live data.

## Colors

All roles are CSS custom properties in `web/src/styles.css:1`. Only light mode is implemented; `color-scheme: light` is intentional and no theme switch is offered.

| Primitive | Value | Semantic role |
| --- | --- | --- |
| `--bone-100` | `#f4f1e8` | `--page`, warm page background |
| `--bone-50` | `#fffdf8` | `--surface`, fields and mint surface; `--on-accent` |
| `--bone-200` | `#e8e4d9` | `--subtle`, disabled controls and progress track |
| `--ink-900` | `#20231f` | `--text`, primary copy and selected trade segment |
| `--ink-600` | `#595d55` | `--muted`, explanatory and secondary copy |
| `--ink-300` | `#a5a99f` | `--border`, structural boundaries |
| `--rust-700` | `#ae351e` | `--accent`, primary mint action |
| `--rust-800` | `#8f2b17` | `--accent-hover` |
| `--green-800` | `#285838` | `--success`, open-state text and network dot |
| `--red-800` | `#942622` | `--error`, persistent actionable error text |
| `--focus` | `#174c99` | Keyboard focus outline |

Status always includes words; color is supplementary. One filled accent action appears in the mint surface. Secondary actions use neutral borders, and the trade selection uses ink rather than a competing accent. Actual rendered contrast checks and their coverage are recorded in `VALIDATION.md` and `frontend/taste-checks.json`.

## Typography

Space Grotesk is loaded locally via three WOFF2 files in `web/src/fonts.css`; Arial and the generic sans-serif family are fallbacks. Real weights are 400, 500 and 700, with font synthesis disabled. Its OFL license is exported as `dist/font-license.txt`.

| Token | Size | Usage |
| --- | --- | --- |
| `--text-sm` | 0.875rem / 14px | Hints, secondary data, address links |
| `--text-body` | 1rem / 16px | Prose, fields and buttons |
| `--text-title` | 1.25rem / 20px | Tertiary headings, desktop identity |
| `--text-section` | 1.5rem / 24px | Section headings; mobile supply figure |
| `--text-stat` | 2.5rem / 40px | Desktop supply figure, decorative edition notation |
| `--text-display` | 4.5rem / 72px | Main heading; 56px at ≤1050px, 40px at ≤760px |

The main heading is the heaviest type at 700, line height 1.05 and tracking −0.055em (−0.045em on mobile). Other headings use 500, line height 1.2–1.3 and slight negative tracking. Body copy is 400 at line height 1.5, with a 66ch maximum measure. Headings balance their lines. Amounts, inputs, progress and changing counts use tabular numerals. Full addresses and long hashes remain selectable and wrap without ellipsis. Forms retain 16px text at normal mobile settings.

## Layout and responsive behavior

The shared shell is at most 1200px wide with 48px side margins. At 1050px the margins become 32px; at 760px they become 20px; at 350px they become 16px. The header places identity at the leading edge and wallet utilities at the trailing edge. It is not sticky.

Desktop minting uses two equal columns with a 64px gap, reduced to 32px at 1050px. The introduction is 560px tall on desktop, making the collection link align with the mint surface. At 760px the layout becomes one column; the decorative edition notation and desktop introduction footer disappear, the heading shrinks and the mint panel follows immediately. The NFT mint action is on the first 390 × 844 screen. The wallet and quantity rows may wrap when text is enlarged.

Sections use 40px vertical spacing on desktop and 28px on mobile. Standard component gaps are 8–12px; groups use 16–24px; major two-column groups use 64/32px. The collection, trade and owner grids collapse to one column at 760px. Details/summary elements disclose the optional trading, contract and management surfaces in normal document flow. The wallet details panel aligns to the header edge and is limited to the header width.

Rendered coverage includes 320, 390, 760 and 1440px, huge balances and full addresses. Text enlargement and physical-device/native-zoom limitations are stated separately in the validation record.

## Surfaces, shape and motion

The mint panel is a single light surface with a 1px structural border, 10px radius and 32px padding (24px on intermediate/mobile, 20px × 16px at the narrowest width). It has no shadow. Other content is grouped with whitespace and restrained horizontal rules rather than nested cards. Buttons have a 6px radius; fields and segmented controls use 5px. Status dots are circular. No gradients, loading shimmer, marquee, entry animation or fixed action bar is used.

Most actions have at least a 44px target; the main mint action is at least 54px high. The quantity buttons are 44px, reduced to 40px wide at ≤350px while retaining 44px height. Inline navigation links rely on the guide's spacing exception. Focus is a 3px explicit outline with 4px offset; forced-color mode uses the system highlight.

Under `prefers-reduced-motion: no-preference`, buttons transition only background color and transform over 120ms; press feedback scales to 0.96. Reduced motion removes those transitions and transforms. Motion is never the only status cue.

## Components and states

| Source | Component or pattern | Use and behavior |
| --- | --- | --- |
| `web/src/App.tsx` | Mint desk | Quantity 1–5, fee summary, supply progress and prerequisite message. Disconnected, wrong-chain, checking, configured, paused, sold-out and exhausted-wallet states are explicit. |
| `web/src/components.tsx` | `ActionButton` | Primary or neutral appearance. The active action labels simulation, wallet confirmation and receipt waiting; all write controls lock during a transaction. |
| `web/src/components.tsx` | `TxFeedback` | Persistent polite status, translated error and explorer link. An uncertain submitted transaction exposes a confirmation recheck without enabling another write. |
| `web/src/components.tsx` | `AddressView` | Full checksummed address, explorer destination, clipboard button and visible copy fallback. |
| `web/src/components.tsx` | `Icon` | Single-color, decorative navigation mark or arrow, hidden from accessibility APIs. |
| `web/src/CollectionTools.tsx` | Transfer and permission forms | Native labelled selects and fields; no custom dropdown. NFT safe transfer, token/operator approval and revocation, Loom transfer and allowance controls. |
| `web/src/TradePanel.tsx` | Quote and review | Neutral buy/sell segments, exact-decimal amount field, slippage select, quote/minimum/rate/deadline and one actionable approval-or-swap step. |
| `web/src/OwnerPanel.tsx` | Owner settings | One control per setting. One-way state disables completed actions. Native checkbox acknowledges freeze; typed text acknowledges renunciation. |
| `web/src/App.tsx` | Empty holdings and token list | Actual count, explicit lookup/cancel actions and token IDs with metadata links. The empty state says how to acquire a cat. |

All controls use native buttons, selects, inputs and details/summary elements. A skip link leads to minting. No custom modal, focus trap, carousel or client routing is present. Missing-wallet errors are alerts; chain and transaction updates have persistent live regions. Fields have visible labels rather than relying on placeholders.

## Extension rules

Reuse the shell, semantic colors, heading scale and `ActionButton`/`TxFeedback` pairing for additional contract actions. Keep the required prerequisites beside the action and use the runtime configuration for contract identity. Add optional content below the mint desk and disclose it when it is not needed for minting. Preserve full critical values, native keyboard behavior and the one primary filled action. Do not add mock NFT artwork, a second live-data source of truth or a fiat value without a real configured feed.

Design review followed the pinned Better Interface guidance by Jakub Krehel (MIT, commit `267330e1adfc66a718fb65fa6918c1f06d0a689e`) and the adapted Impeccable documentation method by Paul Bakaus (Apache-2.0, commit `9d715cc4f5564a990ca8345abfdd5df6dc9b41c8`). Ethereum UX used the pinned Austin Griffith guide at `06ea4efa0807` (MIT). Notices/licenses are retained in `docs/licenses/`; these documents describe this implementation rather than reproducing those guides.
