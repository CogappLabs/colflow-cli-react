# colflow

Bun + TypeScript + Ink TUI for Dagster collection-flow pipelines. Wraps Dagster GraphQL, reads Parquet outputs, scaffolds assets, checks Elasticsearch. Built as a React Ink TUI for interactive exploration and one-shot CLI mode for scripting.

## Install

```sh
bun install
```

## Quick Start

**TUI mode** (interactive browser):

```sh
bun run dev
```

Launches a fullscreen terminal UI. Navigate with arrow keys, search, inspect runs and assets in real time.

**One-shot commands** (scripting):

```sh
bun run dev <command> [args] [flags]
```

Examples:

```sh
bun run dev status                    # Latest run summary
bun run dev runs --limit 10           # List recent runs
bun run dev logs <id>                 # Print run logs
bun run dev materialise asset1 asset2 # Launch a run
bun run dev inspect output/data.parquet  # Inspect Parquet schema
```

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
- `ELASTICSEARCH_URL` — Elasticsearch endpoint for es-check
- `ELASTICSEARCH_API_KEY` — Elasticsearch API key for es-check

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

**Build for distribution:**

```sh
bun run build      # Output: dist/cli.js
bun run compile    # Compile to binary: dist/colflow (requires native deps support)
```

## See Also

Original Go implementation: [colflow-cli](https://github.com/CogappLabs/colflow-cli)
