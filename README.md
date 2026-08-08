# EROS OMP Harness

Private source repository for EROS's fork of the Pi/OMP coding-agent harness. It keeps the TypeScript CLI, native Rust modules, browser relay, collaboration surface, embedded documentation, and Python RPC bridge required to build and run `eros`.

Forked from [Pi](https://github.com/badlogic/pi-mono); upstream license and attribution remain in [`LICENSE`](LICENSE).

## Scope

Included:

- `packages/coding-agent` — the `eros` CLI and tool runtime.
- `packages/{ai,agent,catalog,natives,tui,utils,wire,...}` and `crates/` — its workspace and native dependencies.
- `python/omp-rpc` — the Python eval/RPC bridge.
- `docs/`, `assets/python.webp`, and build tooling required by source and binary builds.

Deliberately excluded from this repository: RoboMP GitHub automation, metaharness and edit-benchmark experiments, prompt-pack archives, machine-local EROS profiles, and self-hosted CI infrastructure.

## Development

Requires Bun 1.3.14+, Rust (for native modules), and Python 3.11+ for the RPC tests.

```sh
bun install
bun run build:native
bun run ci:test:smoke
bun run dev -- --help
```

## Naming

The executable is `eros`. Internal `omp`, `pi`, and `@oh-my-pi/*` identifiers are retained workspace compatibility names from the fork; they are not external repositories or required npm packages. This repo is source-only and does not publish packages by default.

## Related EROS code

This repository is the harness, not the EROS image platform. The platform lives on Bunker in `~/dev/vastai-lab`; the Mac-side `~/dev/vastai` directory is inert and must not host EROS UI services. See [`AGENTS.md`](AGENTS.md) for the operator map.
