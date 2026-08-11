# @lycorperos/eros-gateway

**EROS GATEWAY** — the browser client for [live agent sessions](../../docs/collab.md). Paste an invitation link into the gateway and you get the same live session guests see in the TUI: streaming transcript, tool-call cards, the den of subagents with live transcripts, and a composer that speaks to (or interrupts) the host agent.

## Quick start

```sh
# dev server (Bun HTML dev server with HMR) — http://localhost:3000
bun run dev

# offline demo: local relay + scripted mock host; prints a ws://localhost link
bun run mock-host
```

Host a session from any harness instance (`/collab`, or `/collab ws://localhost:7466` to use the mock relay), then paste the printed link into the connect screen. Deep links work too: `http://localhost:3000/#<roomId>.<key>` auto-connects on load.

## Build & deploy

```sh
bun run build   # static site in dist/
```

`dist/` is a fully static SPA — host it anywhere. JS/CSS bundles are content-hashed; the favicon set, `manifest.webmanifest`, `robots.txt`, `og-image.png`, and the `eros/` render plates come from `public/` and are emitted at the site root under stable names. The gateway is a private surface served off whatever host holds the relay, so there is no canonical URL, no sitemap, and `robots.txt` disallows everything. Two runtime requirements:

- **Secure context**: room keys are unwrapped with WebCrypto (`crypto.subtle`), which browsers expose only on `https://` or `localhost`.
- **Relay reachability**: the client connects straight to the relay over WebSocket (`wss://` for anything that isn't localhost). The default relay is whatever `DEFAULT_RELAY_URL` in `@oh-my-pi/pi-wire` points at (currently `wss://my.omp.sh`, a wire-level constant this package does not own); bare `<roomId>.<key>` links resolve against it (legacy `<roomId>#<key>` and `%23`-mangled links still parse).

The room key never leaves the URL fragment — it is not sent to the relay or any server.

## Look

The gateway wears the Eros platform's skin, not a dev-tool skin.

- `src/styles/tokens.css` is the only file with raw colors. It carries the Eros source palette (`--void`, the `--ink*` ramp, `--champagne`, `--oxblood`, `--blood`, `--off`) and derives every semantic token components consume (`--bg`, `--fg`, `--accent`, `--border`, …) from it, so a theme block only redefines the source layer.
- Display type is Cormorant Garamond italic (wordmarks, headings, thinking blocks); UI type is Manrope, with uppercase tracked micro-labels for roles, chips, and status.
- Champagne is the voice. Blood (`--blood`) appears in exactly two situations: something is still streaming, or something bled — never as decoration.
- `public/eros/` holds four committed render plates, each with one job: `threshold` (connect stage), `chamber` (session backdrop), `hush` (empty transcript), `sealed` (the closed gateway). They are graded and cropped for heavy darkening and referenced by local path only.

## Architecture

- `src/lib/` — vendored wire codec (`codec.ts` AES-256-GCM, `link.ts` envelope + link grammar), `socket.ts` reconnecting relay socket, `client.ts` guest session store (`GuestClient` + immutable snapshots for `useSyncExternalStore`). Shared protocol shapes come from `@oh-my-pi/pi-wire`.
- `src/components/` — `transcript/` (entries, markdown, tool cards), `agents/` (den panel + transcript drawer), `shell/` (connect screen, header, composer, banners, toasts).
- `src/tool-render/` — per-tool React renderers shared with coding-agent HTML session exports: one view per built-in tool, common `ToolView` chrome, theme-adaptive `tv-` design tokens, and an `<omp-tool-view>` web-component wrapper. The `ToolRenderHost` seam lets hosts wire agent-id chips to a sub-session view (drawer here, overlay in exports).
- `scripts/` — `local-relay.ts` (content-blind relay on `Bun.serve`), `mock-host.ts` + `fixture.ts` (scripted host for offline dev), `build-tool-views.ts` (bundles `src/tool-render/` + React into `packages/coding-agent/src/export/html/tool-views.generated.js` for self-contained exports).

The package is intentionally standalone — no dependency on `@oh-my-pi/pi-coding-agent` at runtime or type level. Wire-shape drift is prevented by consuming the same `@oh-my-pi/pi-wire` contracts as the host, with sealed-frame interop still covered by `test/codec.test.ts`.
