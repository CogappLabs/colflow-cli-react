#!/usr/bin/env bun
import { withFullScreen } from 'fullscreen-ink'
import meow from 'meow'
import { runAsset } from './commands/asset.ts'
import { runCancel } from './commands/cancel.ts'
import { runConfig } from './commands/config.ts'
import { runDevServer } from './commands/devserver.ts'
import { runDiff } from './commands/diff.ts'
import { runDuckdb } from './commands/duckdb.ts'
import { runErrors } from './commands/errors.ts'
import { runEsCheck } from './commands/escheck.ts'
import { runGraph } from './commands/graph.ts'
import { runInspect } from './commands/inspect.ts'
import { runLaunch } from './commands/launch.ts'
import { runLogs } from './commands/logs.ts'
import { runMaterialise } from './commands/materialise.ts'
import { runNewAsset } from './commands/newasset.ts'
import { runRecheck } from './commands/recheck.ts'
import { runReload } from './commands/reload.ts'
import { runRun } from './commands/run.ts'
import { runRuns } from './commands/runs.ts'
import { runSample } from './commands/sample.ts'
import { runSensors } from './commands/sensors.ts'
import { runStale } from './commands/stale.ts'
import { runStatus } from './commands/status.ts'
import { runTail } from './commands/tail.ts'
import { loadDotEnv } from './project/index.ts'
import { App } from './tui/App.tsx'

loadDotEnv()
// Late: --asset-root flag overrides env after dotenv load.

const cli = meow(
	`
	Usage
	  $ colflow                Launch TUI (runs browser)
	  $ colflow <command>      Run one-shot command

	Commands
	  status                  Latest run summary
	  runs                    List recent runs
	  run <id>                Show run detail
	  logs <id>               Print run logs
	  errors <id>             Failures for a run
	  tail <id>               Stream run events
	  materialise <name>...   Launch a run for one or more assets
	  launch <job>            Launch a run for a job
	  cancel <id>             Cancel a run
	  recheck <a:check>...    Re-run asset checks without rematerialising
	  reload                  Reload Dagster code location
	  stale                   List stale assets
	  sensors                 List sensors with status + recent ticks
	  asset <key>             Show full asset detail
	  graph                   Print asset dependency graph (grouped + indented)
	  config [--job <name>]   Show run config schema for a job
	  diff <r1> <r2>          Compare two runs side by side
	  start                   uv run dg dev (foreground)
	  debug                   uv run dg dev with DAGSTER_DEBUG=1
	  duckdb [--detach]       Mount all parquets in COLFLOW_ASSET_ROOT and open DuckDB --ui
	  inspect <parquet>       Parquet schema + null counts
	  sample <parquet>        Sample rows (--where field=value, --rows N)
	  es-check [index]        Elasticsearch health + index check
	  new-asset <name>        Scaffold a Dagster asset (--group, --upstream, --dry-run)

	Flags
	  --url <url>     Dagster URL (env: DAGSTER_URL)
	  --auth <token>  Dagster Cloud token (env: DAGSTER_AUTH)
	  --json          JSON output where supported
	  --limit <n>     Max items (runs)
	  --status <s>    Filter (runs)
	  --step <key>    Filter (logs)
	  --level <l>     Filter (logs)
	  --config <path>      Run config file, JSON or YAML (launch, materialise; repeatable, merged left to right)
	  --config-json <json> Inline JSON run config (launch, materialise; merged last, wins over --config)
	  --help          Show this help
`,
	{
		importMeta: import.meta,
		flags: {
			url: { type: 'string' },
			auth: { type: 'string' },
			json: { type: 'boolean', default: false },
			limit: { type: 'number' },
			status: { type: 'string' },
			step: { type: 'string' },
			level: { type: 'string' },
			interval: { type: 'number' },
			rows: { type: 'number' },
			where: { type: 'string', isMultiple: true },
			maxScan: { type: 'number' },
			apiKey: { type: 'string' },
			insecure: { type: 'boolean', default: false },
			indices: { type: 'boolean', default: false },
			upstream: { type: 'string', isMultiple: true },
			group: { type: 'string' },
			title: { type: 'string' },
			test: { type: 'boolean', default: true },
			dryRun: { type: 'boolean', default: false },
			assetRoot: { type: 'string' },
			job: { type: 'string' },
			run1: { type: 'string' },
			run2: { type: 'string' },
			detach: { type: 'boolean', default: false },
			config: { type: 'string', isMultiple: true },
			configJson: { type: 'string' },
		},
	},
)

const url = cli.flags.url ?? process.env.DAGSTER_URL ?? 'http://localhost:3000'
const auth = cli.flags.auth ?? process.env.DAGSTER_AUTH
const json = cli.flags.json
if (cli.flags.assetRoot) process.env.COLFLOW_ASSET_ROOT = cli.flags.assetRoot

const [cmd, ...rest] = cli.input

function needArg(name: string): string {
	const v = rest[0]
	if (!v) {
		process.stderr.write(`${cmd}: missing required argument <${name}>\n`)
		process.exit(2)
	}
	return v
}

async function main() {
	if (!cmd) {
		const { start, waitUntilExit } = withFullScreen(<App url={url} auth={auth} />, {
			patchConsole: false,
			exitOnCtrlC: true,
		})
		await start()
		await waitUntilExit()
		return
	}
	switch (cmd) {
		case 'status':
			await runStatus({ url, auth, json })
			return
		case 'runs':
			await runRuns({ url, auth, json, limit: cli.flags.limit, status: cli.flags.status })
			return
		case 'run':
			await runRun({ url, auth, json, id: needArg('id') })
			return
		case 'logs':
			await runLogs({
				url,
				auth,
				json,
				id: needArg('id'),
				step: cli.flags.step,
				level: cli.flags.level,
			})
			return
		case 'errors':
			await runErrors({ url, auth, json, id: needArg('id') })
			return
		case 'materialise':
			await runMaterialise({
				url,
				auth,
				json,
				assets: rest,
				config: cli.flags.config,
				configJson: cli.flags.configJson,
			})
			return
		case 'launch':
			await runLaunch({
				url,
				auth,
				json,
				job: cli.flags.job ?? rest[0] ?? '',
				config: cli.flags.config,
				configJson: cli.flags.configJson,
			})
			return
		case 'cancel':
			await runCancel({ url, auth, json, id: needArg('id') })
			return
		case 'recheck':
			await runRecheck({ url, auth, json, checks: rest })
			return
		case 'reload':
			await runReload({ url, auth, json })
			return
		case 'stale':
			await runStale({ url, auth, json })
			return
		case 'sensors':
			await runSensors({ url, auth, json })
			return
		case 'asset':
			await runAsset({ url, auth, json, key: needArg('asset-key') })
			return
		case 'graph':
			await runGraph({ url, auth, json })
			return
		case 'config':
			await runConfig({ url, auth, json, job: cli.flags.job ?? 'full_pipeline' })
			return
		case 'diff':
			await runDiff({
				url,
				auth,
				json,
				run1: cli.flags.run1 ?? needArg('run1'),
				run2: cli.flags.run2 ?? needArg('run2'),
			})
			return
		case 'start':
			await runDevServer({ debug: false })
			return
		case 'debug':
			await runDevServer({ debug: true })
			return
		case 'duckdb':
			await runDuckdb({ detach: cli.flags.detach ?? false })
			return
		case 'tail':
			await runTail({
				url,
				auth,
				json,
				id: needArg('id'),
				interval: cli.flags.interval,
			})
			return
		case 'inspect':
			await runInspect({ url, auth, json, path: rest[0] })
			return
		case 'new-asset':
			await runNewAsset({
				url,
				auth,
				name: rest[0],
				upstream: (cli.flags.upstream ?? []).join(','),
				group: cli.flags.group,
				title: cli.flags.title,
				test: cli.flags.test ?? true,
				dryRun: cli.flags.dryRun ?? false,
			})
			return
		case 'es-check':
			await runEsCheck({
				url: cli.flags.url,
				apiKey: cli.flags.apiKey,
				insecure: cli.flags.insecure ?? false,
				json,
				indices: cli.flags.indices ?? false,
				index: rest[0],
			})
			return
		case 'sample':
			await runSample({
				json,
				path: needArg('parquet'),
				rows: cli.flags.rows ?? 5,
				where: cli.flags.where ?? [],
				maxScan: cli.flags.maxScan ?? 1_000_000,
			})
			return
		default:
			process.stderr.write(`Unknown command: ${cmd}\n`)
			process.exit(2)
	}
}

main().catch((e) => {
	process.stderr.write(`${e?.stack ?? e}\n`)
	process.exit(1)
})
