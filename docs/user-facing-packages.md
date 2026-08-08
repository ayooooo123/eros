# User-Facing Packages

This page indexes README-only user-facing package CLIs and features that need root docs coverage beyond package-local READMEs/manifests.

## Root-docs policy

- **Include** root docs coverage for package-local CLIs, extension features, dashboards, and benchmark runners that users can run directly or through `omp`.
- **Exclude explicitly** when a package/crate is internal implementation only; point to the architecture doc that owns it.
- Package READMEs and manifests remain the source of truth for package-local setup and flags; root docs make the feature discoverable and link to exact source paths.
- Internal Rust crates remain covered by native architecture docs unless promoted as standalone user-facing commands or APIs. The contributor-facing map lives at [`native-crates.md`](./native-crates.md); today every `crates/*` entry is internal to `@oh-my-pi/pi-natives` and the embedded shell, so [`natives-architecture.md`](./natives-architecture.md) and the surrounding native docs own them.

## Package CLIs and features


### `packages/stats` — local usage dashboard

Sources: [`packages/stats/README.md`](../packages/stats/README.md), [`packages/stats/package.json`](../packages/stats/package.json), [`packages/coding-agent/src/cli/stats-cli.ts`](../packages/coding-agent/src/cli/stats-cli.ts).

- Package: `@oh-my-pi/omp-stats`; bin: `omp-stats`; main user path: `omp stats`.
- Feature: local observability dashboard for AI usage statistics from session JSONL logs.
- CLI modes: `omp stats` starts the dashboard server, opens `http://localhost:3847`, and keeps running; `omp stats --port <port>` changes the port; `omp stats --summary` prints a console summary; `omp stats --json` prints JSON and exits.
- Programmatic API: exports helpers such as `syncAllSessions()` and `getDashboardStats()` for embedding.
- Inputs/storage: reads `~/.omp/agent/sessions/`; stores aggregates in `~/.omp/stats.db`.
- Outputs: dashboard metrics and API endpoints including `/api/stats`, `/api/stats/models`, `/api/stats/folders`, `/api/stats/timeseries`, and `/api/sync`.
- Side effects/limits: syncs session files before output; long-running dashboard stops on `Ctrl+C` and closes the stats database.

### `packages/omptype` — schema validation library

Sources: [`packages/omptype/README.md`](../packages/omptype/README.md), [`packages/omptype/package.json`](../packages/omptype/package.json), and the repository [omptype authoring guide](./omptype-guide.md).

- Package: public `@oh-my-pi/omptype`; install with `bun add @oh-my-pi/omptype`; requires Bun 1.3.14 or newer.
- Feature: callable ArkType-compatible schemas with cheap interpreted startup, lazy hot-path compilation, validation errors, defaults and morphs, and JSON Schema emission.
- Public surfaces: `@oh-my-pi/omptype` for native authoring, `@oh-my-pi/omptype/typebox` and `/zod` for compatibility builders, and `/ark` for the alias-free ArkType compatibility facade.
- Runtime behavior: schema calls return the validated value or `type.errors`; `.assert()` returns the value or throws; `.allows()` performs a boolean check.
- Limits: this is an intentionally focused compatibility surface rather than a complete implementation of every ArkType, TypeBox, or Zod API.



### `packages/browser-relay` — drive existing Chrome tabs

Sources: [`packages/browser-relay/README.md`](../packages/browser-relay/README.md), [`packages/browser-relay/package.json`](../packages/browser-relay/package.json), [`packages/coding-agent/src/tools/browser/relay/`](../packages/coding-agent/src/tools/browser/relay/).

- Package: private `@oh-my-pi/browser-relay`; user command: `omp browser-relay`.
- Setup: run `omp browser-relay install`, load the unpacked extension from
  `~/.omp/browser-relay/extension`, then set `browser.relay` or use `app.relay: true`.
- Behavior: the relay auto-starts through the global daemon broker; `app.target` selects a tab by
  URL/title substring, otherwise the visible tab is adopted.
- Security/limits: it binds loopback; use `--token` when local processes are untrusted. Chrome
  internal pages, DevTools, Web Store, extension pages, and tabs with DevTools open cannot attach.

### `packages/collab-web` — EROS GATEWAY, the browser client for live sessions

Sources: [`packages/collab-web/README.md`](../packages/collab-web/README.md), [`packages/collab-web/package.json`](../packages/collab-web/package.json), [`docs/collab.md`](./collab.md).

- Package: private `@lycorperos/eros-gateway`; production client: <https://my.omp.sh/>.
- Feature: browser guest UI for `/collab` sessions, including streaming transcript, tool cards,
  the den of subagents, prompts, and host interruption.
- Local paths: `bun run dev` serves the UI on port 3000; `bun run mock-host` runs an offline relay
  and scripted host; `bun run build` emits a static SPA under `dist/`.
- Constraints: non-local deployments require HTTPS and a reachable secure WebSocket relay. The room
  key stays in the URL fragment and is not sent to the relay.

### `packages/snapcompact` — bitmap context-compression API

Sources: [`packages/snapcompact/README.md`](../packages/snapcompact/README.md), [`packages/snapcompact/package.json`](../packages/snapcompact/package.json), [`packages/snapcompact/src/index.ts`](../packages/snapcompact/src/index.ts).

- Package: public `@oh-my-pi/snapcompact`; install with `bun add @oh-my-pi/snapcompact`; requires
  Bun 1.3.14 or newer.
- Feature: deterministic local serialization and PNG rendering of discarded conversation history
  for vision-model context compaction; no model call or API key is required.
- Public entrypoint includes `compact`, `render`, `renderMany`, `frames`, shape selection, text
  normalization/serialization, image budgets, and file-operation helpers.
- Runtime constraint: rasterization and PNG encoding require `@oh-my-pi/pi-natives`.

### `packages/mnemopi` — standalone local-memory CLI

Sources: [`packages/mnemopi/README.md`](../packages/mnemopi/README.md), [`packages/mnemopi/package.json`](../packages/mnemopi/package.json), [`packages/mnemopi/src/cli.ts`](../packages/mnemopi/src/cli.ts), and the coding-agent [Mnemopi memory backend guide](./mnemosyne-memory-backend.md).

- Package: public `@oh-my-pi/pi-mnemopi`; bin: `mnemopi`; requires Bun 1.3.14 or newer. Install globally with `bun add --global @oh-my-pi/pi-mnemopi`, then run `mnemopi <command>`. From a source checkout, `bun packages/mnemopi/src/cli.ts <command>` runs the same entrypoint.
- Store and search: `store`/`remember`, `recall`/`search`, `update`/`edit`, and `delete`/`forget`.
- Inspect and maintain: `stats`, `sleep`/`consolidate`, `diagnose`/`doctor`, JSON `export` and `import`, `scratchpad`/`sp` with `read`, `write`, or `clear`, and `bank` with `list`, `create`, or `delete`.
- Integration: `mcp` starts the package's MCP server. The standalone CLI operates directly on Mnemopi storage; select `memory.backend: mnemopi` instead when integrating memory into OMP sessions, as described in the backend guide.
- Discovery and errors: `mnemopi --help` lists primary command forms. Unknown commands and invalid arguments print a concise error and return a nonzero exit code.
