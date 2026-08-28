# colflow-cli-react

Bun + TypeScript + Ink TUI for Dagster collection-flow pipelines. TS port of the Go [colflow-cli](https://github.com/CogappLabs/colflow-cli). Wraps Dagster GraphQL, reads Parquet outputs via hyparquet, scaffolds assets, hits Elasticsearch, mounts parquets in DuckDB.

## Architecture

- `src/cli.tsx` — entry. meow parses flags, routes no-arg to TUI via `withFullScreen` from `fullscreen-ink`, otherwise dispatches to a `runX` handler.
- `src/client/index.ts` — Dagster GraphQL client (`graphql-request`). All Dagster API access flows through `makeClient` + per-operation typed wrappers (`fetchRuns`, `fetchRun`, `fetchAssets`, `launchAssetRun`, `terminateRun`, `reloadLocation`, `fetchSensors`, etc.).
- `src/commands/` — one file per one-shot CLI command. Each exports a single `runX` async function that reads opts, calls the client, prints to stdout/stderr.
- `src/tui/` — Ink TUI:
  - `App.tsx` — view-stack router (`type View = ...`), persistent header bar + body + keymap footer. Renders inside `<FullScreenBox>` so the alternate screen buffer is owned cleanly.
  - `screens/` — one component per view. Each owns its own polling/state.
  - `components/Table.tsx` — shared columnar table. Props: `columns`, `data`, optional `cursor`, `viewport`, `selected`. Use it for any new list view.
  - `i18n/en.ts` — single source of truth for UI strings. **Always add new user-facing strings here**, then import `t` and reference `t.<screen>.<key>`. Don't inline literals.
  - `theme.ts` — colour palette derived from the Claude Code binary. Use `colour.primary` for brand chrome, semantic ANSI colours (green/red/yellow) for status. **Avoid `dimColor` and `color="gray"` on data lines** — both fail WCAG against dark and light terminal themes. Reserve dim for footer hints, scroll counters, "(no rows)" placeholders. Use `bold` for labels.
  - `useViewport.ts` — `useViewportWindow(total, cursor, reserved)` keeps cursor visible in a scrollable list.
  - `launchClaude.ts` — opens new terminal window (matches `$TERM_PROGRAM`: iTerm, Terminal.app, falls back to Terminal) running the `claude` CLI with cwd set to project root and prompt seeded with run/asset/error context.
  - `launchTerminal.ts` — generic version of the same osascript pattern: takes `{ cwd, command, label }` and spawns a new terminal window. Used by the DuckDB menu item (`colflow duckdb`).
- `src/diff/index.ts` — pure run-diff helpers (`extractSteps`, `statusOf`, `durationStr`, `computeDiff`). Shared between `commands/diff.ts` and `tui/screens/RunsDiff.tsx`.
- `src/parquet/index.ts` — hyparquet wrappers. `inspectParquet`, `sampleRows`, `parseWhere`, `collapseLeafPath`. ZSTD via `hyparquet-compressors`.
- `src/project/` — `detect()` walks up from cwd for `pyproject.toml`. `detectFromEnv()` prefers `COLFLOW_ASSET_ROOT` if absolute, else cwd walk. `resolveAssetPath()` turns relative paths from Dagster `path` metadata into absolute. `workspace.ts` queries Dagster `workspaceOrError.locationEntries[0].displayMetadata` to auto-discover the project root from the running instance — no env var needed when Dagster is reachable.
- `tests/` — `bun:test` unit tests for pure modules (format, diff, parquet helpers, project).

## Conventions

> **CRITICAL — strings**: every user-facing string in the TUI MUST live in
> `src/tui/i18n/en.ts`. No string literals in JSX, no inline confirm prompts,
> no inline column headers. When adding a screen or feature: define the token
> first, then import `t` and reference `t.<screen>.<key>`. Footer keymaps go
> under `t.footer.<view>`. This rule applies even on quick fixes — do not
> defer i18n migration; it always falls through the cracks. Treat any inline
> literal as a bug.
- **Colours**: import `colour` from `src/tui/theme.ts` for brand accents. Use ANSI semantic colours (`'green'`, `'red'`, `'yellow'`, `'cyan'`) for statuses. Don't use `'gray'` or `dimColor` on data.
- **Tables**: use `<Table>` from `src/tui/components/Table.tsx`. Pass `viewport` for scrollable lists, `selected` for multi-select, `cursor` for arrow-key nav.
- **Polling**: `useEffect` with `setTimeout` chain + `cancelled` flag in cleanup. See `RunsList.tsx` for the canonical pattern. Don't use `setInterval` — it doesn't respect in-flight requests.
- **Hotkeys + footer hints**: every selectable hotkey must appear in the matching `t.footer.<screen>` string so users can discover it.
- **GraphQL queries**: define query string + types adjacent in `src/client/index.ts`. Typed wrapper functions (`fetchX`, `launchX`) export the operation; screens never construct GraphQL directly.
- **One-shot commands** (`src/commands/`): write to `process.stdout` / `process.stderr` directly. Don't import Ink. Support `--json` where it makes sense.
- **Adding a screen**: build component, register a `View` kind in `App.tsx`, add `viewLabel` + `viewKeymap` cases, push i18n tokens.
- **Adding a command**: `src/commands/<name>.ts` exporting `runX`, register a `case` in `src/cli.tsx`, document in README.

## Available commands

`status`, `runs`, `run`, `logs`, `errors`, `tail`, `materialise`, `launch`, `cancel`, `recheck`, `reload`, `stale`, `sensors`, `schedules`, `ticks`, `doctor`, `asset`, `graph`, `config`, `diff`, `inspect`, `sample`, `es-check`, `new-asset`, `start`, `debug`, `duckdb`. (27 commands.)

TUI menu items: Runs, Assets, Jobs, Sensors, Elasticsearch (gated on `ELASTICSEARCH_*`/`ELASTICO_*` env vars), DuckDB (spawns `colflow duckdb` in a new terminal), Reload Dagster.

`launch` and `materialise` accept run config like `dg`: `--config <path>` (JSON or YAML, repeatable, shallow-merged left to right) and `--config-json <inline>` (merged last, wins). Both resolve via `resolveRunConfig` in `src/commands/_runconfig.ts` and flow into the `runConfigData` field of `ExecutionParams` in `launchRun` / `launchAssetRun`. Without either flag the config is `{}`, so prior default-config behaviour is unchanged. Use it to set resource config, e.g. `colflow launch image_qc_pipeline --config-json '{"resources":{"colour_target_qc":{"config":{"use_vision":true}}}}'`.

## GraphQL schema notes

- `metadataEntries` is a union — use typed inline fragments (`IntMetadataEntry`, `TextMetadataEntry`, `PathMetadataEntry`, `JsonMetadataEntry`, `BoolMetadataEntry`, `FloatMetadataEntry`, `MarkdownMetadataEntry`, `UrlMetadataEntry`, `TableSchemaMetadataEntry`, `TableMetadataEntry`).
- `sensorsOrError` and `schedulesOrError` require a `repositorySelector`.
- `instigationStateOrError` covers sensors and schedules alike, keyed by bare
  name in an `InstigationSelector` — there is no separate schedule-tick query.
- `workspaceOrError.locationEntries[].displayMetadata` exposes `working_directory`, `module_name`, `host`, `socket` — **not** env vars (security boundary). Use `working_directory` to auto-derive project root.
- Asset checks live in their own steps — match by `assetKey`, not `stepKey`. See `fetchRunAssetDetail` for the pattern.
- Dagster timestamps mix seconds and ms strings; use `tsToSeconds` from `src/format/index.ts` to normalise.

## Parquet handling

- Pure JS via `hyparquet` + `hyparquet-compressors` (ZSTD). No CGO, no shellout to duckdb (except for the `duckdb` command which mounts parquets as views in `duckdb --ui`).
- `inspectParquet(path)`: schema tree + row count + null-count per column.
- `sampleRows(path, limit, filters, maxScan)`: streaming row sampler with `--where field=value` (dot paths supported).
- `collapseLeafPath` collapses Parquet list/map encodings (`foo.list.element.bar` → `foo[].bar`).

## Workspace + asset path resolution

Order:
1. Dagster GraphQL `workspaceOrError.locationEntries[0].displayMetadata.working_directory` (cached for the session via `resolveWorkspace`)
2. `COLFLOW_ASSET_ROOT` env var if absolute
3. `detect()` walks up from cwd for `pyproject.toml`
4. Fallback: `./output`

Materialisation `path` metadata (e.g. `output/foo.parquet`) is resolved against this base via `resolveAssetPath`.

## Release

GitHub Actions on `v*` tag → multi-arch `bun build --compile` → release tarballs → updates `CogappLabs/homebrew-tap`. See `.github/workflows/release.yml`. Secret: `TAP_GITHUB_TOKEN`.

## Project status

Public repo (`CogappLabs/colflow-cli-react`). Replaces the Go [colflow-cli](https://github.com/CogappLabs/colflow-cli) — same Homebrew formula name (`colflow`).
