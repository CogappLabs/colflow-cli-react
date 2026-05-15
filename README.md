# colflow

Bun + TypeScript + Ink TUI for Dagster collection-flow pipelines. Wraps Dagster GraphQL, reads Parquet outputs, scaffolds assets, checks Elasticsearch. Built as a React Ink TUI for interactive exploration and one-shot CLI mode for scripting.

## Install

### Homebrew (recommended)

```sh
brew install CogappLabs/tap/colflow
```

This installs the standalone binary. No Bun or Node required. Replaces the Go-based `colflow` binary if you had it installed previously.

Builds: macOS (arm64, x64), Linux (x64, arm64).

#### macOS Gatekeeper

Binaries are not yet code-signed. On first launch macOS may block with "cannot be opened because the developer cannot be verified". Clear the quarantine attribute:

```sh
xattr -d com.apple.quarantine $(which colflow)
```

### From source

```sh
bun install
```

## Quick Start

After `brew install` the binary is on PATH as `colflow`.

### Prerequisite: a running Dagster server

Almost every command talks to a Dagster instance over GraphQL. Start the dev server in your collection-flow project before running `colflow`:

```sh
uv run dg dev      # or `task start` if your project has a Taskfile
```

By default `colflow` connects to `http://localhost:3000`. Override with `--url` or the `DAGSTER_URL` env var (e.g. for Dagster Cloud). Without a reachable server the TUI menu still loads but Runs / Assets / Jobs / Sensors / Reload will be empty or error; `inspect`, `sample`, `duckdb`, `es-check` and `new-asset` work without it.

**TUI mode** (interactive browser):

```sh
colflow
```

Launches a fullscreen terminal UI. Navigate with arrow keys, search, inspect runs and assets in real time.

### TUI features

- **Menu**: Runs, Assets, Jobs, Sensors, Elasticsearch, DuckDB, Reload Dagster
- **Runs list**: live polling, `d` to mark two runs and diff them, `↵` to drill in
- **Run detail**: per-step status, asset checks summary, `t` tail, `x` cancel
- **Tail**: live event stream, `space` pause, `/` filter, `↑/↓` scroll
- **Asset view**: failure detail, check results, metadata, materialise/schema/sample/sample-by-id actions, `c` opens new terminal with Claude Code (claude CLI) seeded with the failure context, `r` re-runs a failed check
- **Assets list**: `/` live search, `space` multi-select, `m` batch materialise
- **Job detail**: layered DAG of in-job assets, `l` launch with confirmation
- **Schema/Sample**: drill into local Parquet outputs (auto-discovers project root via Dagster workspace)
- **Elasticsearch**: cluster health, indices, aliases tabs; drill into index for mapping + sample documents (only enabled when `ELASTICSEARCH_URL` / `ELASTICO_URL` is set)
- **DuckDB**: opens a new terminal window with all parquets under the asset root mounted as views in `duckdb --ui`

**One-shot commands** (scripting):

```sh
colflow <command> [args] [flags]
```

Examples:

```sh
colflow status                    # Latest run summary
colflow runs --limit 10           # List recent runs
colflow logs <id>                 # Print run logs
colflow materialise asset1 asset2 # Launch a run
colflow inspect output/data.parquet  # Inspect Parquet schema
colflow es-check                  # Elasticsearch cluster + indices summary
colflow duckdb                    # Mount parquets and open duckdb --ui
```

When developing from source, replace `colflow` with `bun run dev` (e.g. `bun run dev runs --limit 10`).

## Command Reference

| Command | Purpose |
|---------|---------|
| `status` | Latest run summary |
| `runs` | List recent runs (--limit, --status) |
| `run <id>` | Show run detail |
| `logs <id>` | Print run logs (--step, --level) |
| `errors <id>` | Failures for a run |
| `tail <id>` | Stream run events (--interval) |
| `materialise <name>...` | Launch a run for assets |
| `cancel <id>` | Cancel a run |
| `recheck <a:check>...` | Re-run asset checks |
| `reload` | Reload Dagster code location |
| `stale` | List stale assets |
| `sensors` | List sensors with status |
| `asset <key>` | Full asset detail |
| `graph` | Asset dependency graph |
| `config` | Run config schema (--job) |
| `diff <r1> <r2>` | Compare two runs (--run1, --run2) |
| `inspect <parquet>` | Parquet schema and null counts |
| `sample <parquet>` | Sample rows (--rows, --where, --max-scan) |
| `es-check [index]` | Elasticsearch health (--api-key, --insecure, --indices) |
| `new-asset <name>` | Scaffold a Dagster asset (--group, --upstream, --title, --test, --dry-run) |
| `start` | `uv run dg dev` (foreground) |
| `debug` | `uv run dg dev` with DAGSTER_DEBUG=1 |
| `duckdb [--detach]` | Mount all parquets in COLFLOW_ASSET_ROOT as DuckDB views and open `duckdb --ui` |

## Global Flags

| Flag | Purpose |
|------|---------|
| `--url <url>` | Dagster URL (env: DAGSTER_URL, default: http://localhost:3000) |
| `--auth <token>` | Dagster Cloud token (env: DAGSTER_AUTH) |
| `--json` | JSON output where supported |

## Environment Variables

- `DAGSTER_URL` — Dagster instance URL (default: http://localhost:3000)
- `DAGSTER_AUTH` — Dagster Cloud authentication token
- `COLFLOW_ASSET_ROOT` — Root path for asset detection (overrides via --asset-root)
- `ELASTICSEARCH_URL` (or `ELASTICO_URL`) — Elasticsearch endpoint for es-check
- `ELASTICSEARCH_API_KEY` (or `ELASTICO_API_KEY`) — Elasticsearch API key for es-check

Set these in `.env` at your project root, or pass via flags.

## Development

**Format + lint:**

```sh
bun run check
```

**Type check:**

```sh
bun run typecheck
```

**Tests:**

```sh
bun test
```

**Build for distribution:**

```sh
bun run build      # Output: dist/cli.js
bun run compile    # Compile to binary: dist/colflow (requires native deps support)
```

## Architecture

- `src/cli.tsx` — entry, meow flag parsing, routes to TUI (no args) or one-shot subcommand
- `src/client/` — Dagster GraphQL client + types
- `src/commands/` — one-shot CLI command handlers
- `src/tui/` — Ink components
  - `App.tsx` — view-stack router, persistent header/footer chrome
  - `screens/` — one component per view
  - `components/Table.tsx` — shared columnar table with cursor + viewport + selection
  - `i18n/en.ts` — UI strings (single source of truth)
  - `theme.ts` — colour palette (Claude Code-inspired, hex codes adapt to terminal theme)
  - `launchClaude.ts` — opens new terminal window with `claude` CLI + error context
  - `launchTerminal.ts` — generic helper for spawning a new terminal window with an arbitrary shell command (used by the DuckDB menu item)
- `src/diff/` — pure run-diff logic (shared between CLI and TUI screen)
- `src/parquet/` — hyparquet wrappers (schema inspection, row sampling, ZSTD support)
- `src/project/` — pyproject.toml detection, COLFLOW_ASSET_ROOT resolution, workspace lookup via Dagster GraphQL
- `tests/` — `bun:test` unit tests for pure modules

## See Also

Original Go implementation: [colflow-cli](https://github.com/CogappLabs/colflow-cli)
