#!/usr/bin/env bun
import { withFullScreen } from 'fullscreen-ink'
import meow from 'meow'
import { splitBasicAuth } from './client/url.ts'
import { runAsset } from './commands/asset.ts'
import { runCancel } from './commands/cancel.ts'
import { runChecks } from './commands/checks.ts'
import { runConfig } from './commands/config.ts'
import { runDevServer } from './commands/devserver.ts'
import { runDiff } from './commands/diff.ts'
import { runDoctor } from './commands/doctor.ts'
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
import { runSchedules } from './commands/schedules.ts'
import { runSensors } from './commands/sensors.ts'
import { runStale } from './commands/stale.ts'
import { runStatus } from './commands/status.ts'
import { runTail } from './commands/tail.ts'
import { runTicks } from './commands/ticks.ts'
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
	  errors <id>             Failures for a run, plus metadata of failed checks
	  checks <asset>          Asset checks with latest result + metadata (--check, --limit)
	  tail <id>               Stream run events
	  materialise [<name>...] Launch a run for assets by name and/or group (--group, --exclude-group)
	  launch <job>            Launch a run for a job
	  cancel <id>             Cancel a run
	  recheck <a:check>...    Re-run asset checks without rematerialising
	  reload                  Reload Dagster code location
	  stale                   List stale assets
	  sensors                 List sensors with status + recent ticks
	  schedules               List schedules with status + recent ticks
	  ticks <name>            Tick history for a sensor or schedule
	  doctor                  Instance health: daemons, locations, failing ticks
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
	  --basic-auth <user:pass>  HTTP Basic credentials (env: DAGSTER_BASIC_AUTH);
	                            also read from userinfo in --url
	  --mount-root <path>  Deploy mount prefix to rewrite to S3 (env: COLFLOW_MOUNT_ROOT)
	  --s3-bucket <name>   Assets bucket for remote parquet reads (env: COLFLOW_S3_BUCKET)
	  --json          JSON output where supported
	  --limit <n>     Max items (runs, checks)
	  --status <s>    Filter (runs)
	  --check <name>  Filter (checks)
	  --step <key>    Filter (logs)
	  --level <l>     Filter (logs)
	  --config <path>      Run config file, JSON or YAML (launch, materialise; repeatable, merged left to right)
	  --config-json <json> Inline JSON run config (launch, materialise; merged last, wins over --config)
	  --op-config <op>:<key>=<value>
	                        Set one run config field (launch, materialise; repeatable, wins over
	                        --config/--config-json). Value parses as JSON where possible, else string.
	  --tag <key=value>    Run tag (launch, materialise; repeatable). Splits on the first '='.
	  --group <name>       Group to include (materialise: repeatable; new-asset: group for the new asset)
	  --exclude-group <name>
	                        Drop a group from the materialise selection (repeatable). With no names or
	                        --group, selects every asset except the excluded groups.
	  --help          Show this help
`,
	{
		importMeta: import.meta,
		flags: {
			url: { type: 'string' },
			auth: { type: 'string' },
			basicAuth: { type: 'string' },
			json: { type: 'boolean', default: false },
			limit: { type: 'number' },
			check: { type: 'string' },
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
			group: { type: 'string', isMultiple: true },
			excludeGroup: { type: 'string', isMultiple: true },
			title: { type: 'string' },
			test: { type: 'boolean', default: true },
			dryRun: { type: 'boolean', default: false },
			assetRoot: { type: 'string' },
			mountRoot: { type: 'string' },
			s3Bucket: { type: 'string' },
			job: { type: 'string' },
			run1: { type: 'string' },
			run2: { type: 'string' },
			detach: { type: 'boolean', default: false },
			config: { type: 'string', isMultiple: true },
			configJson: { type: 'string' },
			opConfig: { type: 'string', isMultiple: true },
			tag: { type: 'string', isMultiple: true },
		},
	},
)

// Credentials may arrive inside the URL (https://user:pass@host); strip them
// out so the endpoint stays clean and they reach the Basic header instead.
const rawUrl = cli.flags.url ?? process.env.DAGSTER_URL ?? 'http://localhost:3000'
const { url, basicAuth: urlBasicAuth } = splitBasicAuth(rawUrl)
const auth = cli.flags.auth ?? process.env.DAGSTER_AUTH
const basicAuth = cli.flags.basicAuth ?? process.env.DAGSTER_BASIC_AUTH ?? urlBasicAuth
const json = cli.flags.json
if (cli.flags.assetRoot) process.env.COLFLOW_ASSET_ROOT = cli.flags.assetRoot
// Mount-root / bucket resolve a Dagster-reported mount path to an S3 URI so
// inspect/sample/duckdb can read a remote deployment's parquet. Set into env so
// the resolver reaches them without threading through every command.
if (cli.flags.mountRoot) process.env.COLFLOW_MOUNT_ROOT = cli.flags.mountRoot
if (cli.flags.s3Bucket) process.env.COLFLOW_S3_BUCKET = cli.flags.s3Bucket
// makeClient reads DAGSTER_BASIC_AUTH as a fallback, so setting it here reaches
// every command without threading basicAuth through each one.
if (basicAuth) process.env.DAGSTER_BASIC_AUTH = basicAuth

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
		case 'checks':
			await runChecks({
				url,
				auth,
				json,
				key: needArg('asset'),
				check: cli.flags.check,
				limit: cli.flags.limit,
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
				groups: cli.flags.group,
				excludeGroups: cli.flags.excludeGroup,
				config: cli.flags.config,
				configJson: cli.flags.configJson,
				opConfig: cli.flags.opConfig,
				tag: cli.flags.tag,
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
				opConfig: cli.flags.opConfig,
				tag: cli.flags.tag,
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
		case 'schedules':
			await runSchedules({ url, auth, json })
			return
		case 'ticks':
			await runTicks({ url, auth, json, name: needArg('name'), limit: cli.flags.limit })
			return
		case 'doctor':
			await runDoctor({ url, auth, json })
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
				group: cli.flags.group?.at(-1),
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
				url,
				auth,
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
