import { existsSync } from 'node:fs'
import { Spinner } from '@inkjs/ui'
import { Box, Text, useInput } from 'ink'
import { useEffect, useState } from 'react'
import {
	type AssetCheckEval,
	type AssetDetailNode,
	type AssetFailure,
	fetchAssetDetail,
	fetchRunAssetDetail,
	launchAssetCheckRun,
	launchAssetRun,
	type MetadataEntry,
	makeClient,
	type RunAssetDetail,
} from '../../client/index.ts'
import { formatTimestamp, statusColour, timeAgo } from '../../format/index.ts'
import {
	detectFromEnv,
	isLocalAssetRoot,
	resolveAssetPath,
	resolveParquetPath,
} from '../../project/index.ts'
import { resolveWorkspace } from '../../project/workspace.ts'

interface RunContext {
	runId: string
	stepKey: string
	runStatus?: string
}

interface Props {
	url: string
	auth?: string
	path: string[]
	runContext?: RunContext
	onBack: () => void
	onSchema: (parquetPath: string, assetName: string) => void
	onSample: (parquetPath: string, assetName: string) => void
	onSampleById: (parquetPath: string, assetName: string) => void
	onLaunched: (runId: string) => void
	onDetails: (title: string, body: string) => void
	onMetadata: (entry: MetadataEntry) => void
	onCheck: (check: AssetCheckEval) => void
}

type LaunchPhase =
	| { kind: 'idle' }
	| { kind: 'confirm' }
	| { kind: 'launching' }
	| { kind: 'error'; message: string }

function truncate(s: string, n: number): string {
	const oneLine = s.replace(/\s+/g, ' ').trim()
	return oneLine.length > n ? `${oneLine.slice(0, n)}…` : oneLine
}

function renderMetaValue(e: MetadataEntry, max = 120): string {
	switch (e.__typename) {
		case 'IntMetadataEntry':
			return String(e.intValue)
		case 'FloatMetadataEntry':
			return String(e.floatValue)
		case 'TextMetadataEntry':
			return truncate(e.text ?? '', max)
		case 'PathMetadataEntry':
			return e.path ?? ''
		case 'BoolMetadataEntry':
			return String(e.boolValue)
		case 'JsonMetadataEntry':
			return truncate(e.jsonString ?? '', max)
		case 'UrlMetadataEntry':
			return e.url ?? ''
		case 'MarkdownMetadataEntry':
			return truncate(e.mdStr ?? '', max)
		case 'TableSchemaMetadataEntry':
			return e.schema ? `${e.schema.columns.length} columns` : '(table schema)'
		case 'TableMetadataEntry':
			return e.table
				? `${e.table.records.length} rows × ${e.table.schema.columns.length} cols`
				: '(table)'
		default:
			return `(${e.__typename.replace(/MetadataEntry$/, '').toLowerCase()})`
	}
}

function rawMetaValue(e: MetadataEntry): string {
	switch (e.__typename) {
		case 'TextMetadataEntry':
			return e.text ?? ''
		case 'JsonMetadataEntry': {
			const s = e.jsonString ?? ''
			try {
				return JSON.stringify(JSON.parse(s), null, 2)
			} catch {
				return s
			}
		}
		case 'MarkdownMetadataEntry':
			return e.mdStr ?? ''
		case 'TableSchemaMetadataEntry': {
			const cols = e.schema?.columns ?? []
			if (cols.length === 0) return '(empty schema)'
			const nameW = Math.max(4, ...cols.map((c) => c.name.length))
			const typeW = Math.max(4, ...cols.map((c) => c.type.length))
			const out = [`${'NAME'.padEnd(nameW)}  ${'TYPE'.padEnd(typeW)}  NULLABLE  CONSTRAINTS`]
			for (const c of cols) {
				const constraints = [
					...(c.constraints.unique ? ['unique'] : []),
					...c.constraints.other,
				].join(', ')
				out.push(
					`${c.name.padEnd(nameW)}  ${c.type.padEnd(typeW)}  ${
						c.constraints.nullable ? 'yes' : 'no '
					}       ${constraints}`,
				)
			}
			return out.join('\n')
		}
		case 'TableMetadataEntry': {
			const t = e.table
			if (!t) return '(empty table)'
			const cols = t.schema.columns
			const records = t.records.map((r) => {
				try {
					return JSON.parse(r) as Record<string, unknown>
				} catch {
					return {}
				}
			})
			const widths = cols.map((c) =>
				Math.max(c.name.length, ...records.map((r) => String(r[c.name] ?? '').length)),
			)
			const header = cols.map((c, i) => c.name.padEnd(widths[i]!)).join('  ')
			const out = [header]
			for (const r of records) {
				out.push(cols.map((c, i) => String(r[c.name] ?? '').padEnd(widths[i]!)).join('  '))
			}
			return out.join('\n')
		}
		default:
			return renderMetaValue(e, 10_000)
	}
}

function failureBody(f: AssetFailure): string {
	const out: string[] = []
	if (f.error?.message) out.push(f.error.message)
	for (const c of f.error?.causes ?? []) {
		out.push('', `caused by: ${c.message}`)
		if (c.stack) out.push(c.stack)
	}
	if (f.error?.stack) out.push('', f.error.stack)
	return out.join('\n')
}

function checkBody(c: AssetCheckEval): string {
	const out = [`${c.success ? 'PASS' : 'FAIL'}  ${c.checkName}  (severity: ${c.severity})`, '']
	for (const e of c.metadataEntries) {
		out.push(`${e.label}:`)
		out.push(rawMetaValue(e))
		out.push('')
	}
	return out.join('\n')
}

interface Row {
	kind: 'failure' | 'check' | 'meta' | 'action'
	label: string
	value: string
	colour?: string
	openable: boolean
	body?: string
	title?: string
	action?: 'materialise' | 'schema' | 'sample' | 'sample-by-id'
	checkName?: string
	checkFailed?: boolean
	check?: AssetCheckEval
	meta?: MetadataEntry
}

export function AssetView({
	url,
	auth,
	path,
	runContext,
	onBack,
	onSchema,
	onSample,
	onSampleById,
	onLaunched,
	onDetails,
	onMetadata,
	onCheck,
}: Props) {
	const [detail, setDetail] = useState<AssetDetailNode | null | 'missing'>(null)
	const [runDetail, setRunDetail] = useState<RunAssetDetail | null>(null)
	const [error, setError] = useState<string | null>(null)
	const [phase, setPhase] = useState<LaunchPhase>({ kind: 'idle' })
	const [wsProject, setWsProject] = useState<ReturnType<typeof detectFromEnv>>(null)
	const [cursor, setCursor] = useState<number | null>(null)

	const assetName = path[path.length - 1] ?? ''
	const project = wsProject ?? detectFromEnv()

	useEffect(() => {
		const client = makeClient({ url, auth })
		fetchAssetDetail(client, path)
			.then((d) => setDetail(d ?? 'missing'))
			.catch((e) => setError(String(e?.message ?? e)))
		if (runContext) {
			fetchRunAssetDetail(client, runContext.runId, runContext.stepKey).then(setRunDetail)
		}
	}, [url, auth, path, runContext])

	useEffect(() => {
		resolveWorkspace(url, auth).then((r) => {
			if (r?.project) setWsProject(r.project)
		})
	}, [url, auth])

	// Resolve parquet path via materialisation metadata, then fallback to local guess.
	const data = detail && detail !== 'missing' ? detail : null
	const lastMatPath = (() => {
		const entries = data?.assetMaterializations[0]?.metadataEntries
		if (!entries) return null
		const byLabel = entries.find(
			(e) => e.label.toLowerCase() === 'path' && e.__typename === 'PathMetadataEntry',
		)
		const anyPath = entries.find((e) => e.__typename === 'PathMetadataEntry')
		return byLabel?.path ?? anyPath?.path ?? null
	})()
	const parquetPath = lastMatPath?.endsWith('.parquet')
		? resolveAssetPath(lastMatPath, project)
		: project
			? resolveParquetPath(assetName, project)
			: null
	const isLocal = parquetPath ? isLocalAssetRoot() && !parquetPath.includes('://') : false
	const parquetExists = !!(isLocal && parquetPath && existsSync(parquetPath))

	// Build rows
	const rows: Row[] = []

	// Actions
	rows.push({
		kind: 'action',
		label: 'MATERIALISE',
		value: 'launch run for this asset',
		colour: 'green',
		openable: true,
		action: 'materialise',
	})
	if (parquetExists && parquetPath) {
		rows.push({
			kind: 'action',
			label: 'SCHEMA',
			value: parquetPath,
			colour: 'cyan',
			openable: true,
			action: 'schema',
		})
		rows.push({
			kind: 'action',
			label: 'SAMPLE',
			value: 'first N rows',
			colour: 'cyan',
			openable: true,
			action: 'sample',
		})
		rows.push({
			kind: 'action',
			label: 'SAMPLE BY ID',
			value: 'filter rows by column = value',
			colour: 'cyan',
			openable: true,
			action: 'sample-by-id',
		})
	}

	// Run-context failure
	if (runDetail?.failure) {
		rows.push({
			kind: 'failure',
			label: 'FAILURE',
			value: truncate(runDetail.failure.error?.message ?? runDetail.failure.message, 120),
			colour: 'red',
			openable: true,
			title: 'Failure',
			body: failureBody(runDetail.failure),
		})
	}

	// Checks (run-scoped if available)
	const checks = runDetail?.checks ?? []
	for (const c of checks) {
		rows.push({
			kind: 'check',
			label: c.success ? 'PASS' : 'FAIL',
			value: c.checkName,
			colour: c.success ? 'green' : 'red',
			openable: c.metadataEntries.length > 0,
			title: `Check: ${c.checkName}`,
			body: checkBody(c),
			checkName: c.checkName,
			checkFailed: !c.success,
			check: c,
		})
	}

	// Materialisation metadata (latest). Selectable entries (large bodies users
	// can drill into) go in the main rows list; the rest render as a static
	// footer block so non-interactive data doesn't compete with arrow keys.
	const matEntries =
		runDetail?.materialisation?.metadataEntries ??
		data?.assetMaterializations[0]?.metadataEntries ??
		[]
	const staticMeta: { label: string; value: string }[] = []
	for (const e of matEntries) {
		const long =
			(e.__typename === 'TextMetadataEntry' && (e.text?.length ?? 0) > 80) ||
			(e.__typename === 'JsonMetadataEntry' && (e.jsonString?.length ?? 0) > 80) ||
			(e.__typename === 'MarkdownMetadataEntry' && (e.mdStr?.length ?? 0) > 80) ||
			(e.__typename === 'TableSchemaMetadataEntry' && (e.schema?.columns.length ?? 0) > 0) ||
			(e.__typename === 'TableMetadataEntry' && (e.table?.records.length ?? 0) > 0)
		if (!long) {
			staticMeta.push({ label: e.label, value: renderMetaValue(e) })
			continue
		}
		rows.push({
			kind: 'meta',
			label: e.label,
			value: renderMetaValue(e),
			openable: true,
			title: e.label,
			body: rawMetaValue(e),
			meta: e,
		})
	}

	const openableIndices = rows.map((r, i) => (r.openable ? i : -1)).filter((i) => i >= 0)

	useEffect(() => {
		if (cursor === null && openableIndices.length > 0) {
			// Default cursor: first failure/fail row, else first action
			const failIdx = rows.findIndex(
				(r) => r.openable && (r.kind === 'failure' || (r.kind === 'check' && r.colour === 'red')),
			)
			setCursor(failIdx >= 0 ? failIdx : openableIndices[0]!)
		}
	}, [cursor, openableIndices, rows])

	const triggerAction = (action: NonNullable<Row['action']>) => {
		if (action === 'materialise') {
			setPhase({ kind: 'confirm' })
			return
		}
		if (!parquetExists || !parquetPath) return
		if (action === 'schema') onSchema(parquetPath, assetName)
		if (action === 'sample') onSample(parquetPath, assetName)
		if (action === 'sample-by-id') onSampleById(parquetPath, assetName)
	}

	useInput((input, key) => {
		if (phase.kind === 'launching') return
		if (input === 'q' || key.escape || key.leftArrow) {
			if (phase.kind === 'confirm') {
				setPhase({ kind: 'idle' })
				return
			}
			onBack()
			return
		}
		if (phase.kind === 'confirm') {
			if (input === 'y' || key.return) {
				setPhase({ kind: 'launching' })
				const client = makeClient({ url, auth })
				launchAssetRun(client, [assetName])
					.then((runId) => onLaunched(runId))
					.catch((e: Error) => {
						setPhase({ kind: 'error', message: String(e?.message ?? e) })
					})
			}
			if (input === 'n') setPhase({ kind: 'idle' })
			return
		}
		if (phase.kind === 'error' && key.return) {
			setPhase({ kind: 'idle' })
			return
		}
		// Hotkeys
		if (input === 'm') triggerAction('materialise')
		if (input === 's' && parquetExists) triggerAction('schema')
		if (input === 'd' && parquetExists) triggerAction('sample')
		if (input === 'i' && parquetExists) triggerAction('sample-by-id')
		if (input === 'r' && cursor !== null) {
			const r = rows[cursor]
			if (r?.kind === 'check' && r.checkFailed && r.checkName && data?.assetKey) {
				const checkName = r.checkName
				setPhase({ kind: 'launching' })
				const client = makeClient({ url, auth })
				launchAssetCheckRun(client, [
					{ assetPath: data.assetKey.path, checkName },
				])
					.then((runId) => onLaunched(runId))
					.catch((e: Error) => {
						setPhase({ kind: 'error', message: String(e?.message ?? e) })
					})
			}
		}
		// Cursor nav (openable rows only)
		if (openableIndices.length === 0) return
		if (key.upArrow) {
			setCursor((c) => {
				const idx = openableIndices.indexOf(c ?? openableIndices[0]!)
				return openableIndices[Math.max(0, idx - 1)]!
			})
		}
		if (key.downArrow) {
			setCursor((c) => {
				const idx = openableIndices.indexOf(c ?? openableIndices[0]!)
				return openableIndices[Math.min(openableIndices.length - 1, idx + 1)]!
			})
		}
		if (key.return && cursor !== null) {
			const r = rows[cursor]
			if (!r) return
			if (r.action) {
				triggerAction(r.action)
				return
			}
			if (r.kind === 'check' && r.check) {
				onCheck(r.check)
				return
			}
			if (r.kind === 'meta' && r.meta) {
				onMetadata(r.meta)
				return
			}
			if (r.body && r.title) {
				onDetails(r.title, r.body)
			}
		}
	})

	if (error) return <Text color="red">Error: {error}</Text>
	if (!detail) return <Spinner label="Loading asset..." />
	if (detail === 'missing') return <Text color="red">Asset not found: {path.join('/')}</Text>

	const lastMat = detail.assetMaterializations[0]
	const staleColour =
		detail.staleStatus === 'FRESH' ? 'green' : detail.staleStatus === 'STALE' ? 'yellow' : 'gray'
	const maxLabel = Math.max(8, ...rows.map((r) => r.label.length))

	return (
		<Box flexDirection="column">
			<Text bold color="cyan">
				{detail.assetKey.path.join('/')}
			</Text>
			{detail.description && <Text wrap="truncate">{detail.description}</Text>}
			<Box flexDirection="column">
				<Text>
					<Text bold>Group:</Text> {detail.groupName ?? '-'}
					{'   '}
					<Text bold>Stale:</Text> <Text color={staleColour}>{detail.staleStatus}</Text>
					{detail.kinds.length > 0 && (
						<>
							{'   '}
							<Text bold>Kinds:</Text> {detail.kinds.join(', ')}
						</>
					)}
				</Text>
				{detail.jobNames.length > 0 && (
					<Text wrap="truncate">
						<Text bold>Jobs:</Text> {detail.jobNames.join(', ')}
					</Text>
				)}
				{lastMat && (
					<Text>
						<Text bold>Last mat:</Text> {formatTimestamp(lastMat.timestamp)} (
						{timeAgo(lastMat.timestamp)})
					</Text>
				)}
				{runContext && (
					<Text>
						<Text bold>In run:</Text> {runContext.runId.slice(0, 8)}{' '}
						{runContext.runStatus && (
							<Text color={statusColour(runContext.runStatus)}>{runContext.runStatus}</Text>
						)}
					</Text>
				)}
			</Box>

			{(detail.dependencyKeys.length > 0 || detail.dependedByKeys.length > 0) && (
				<Box marginTop={1} flexDirection="column">
					{detail.dependencyKeys.length > 0 && (
						<Text wrap="truncate">
							<Text bold>Upstream:</Text>{' '}
							{detail.dependencyKeys.map((k) => k.path.join('/')).join(', ')}
						</Text>
					)}
					{detail.dependedByKeys.length > 0 && (
						<Text wrap="truncate">
							<Text bold>Downstream:</Text>{' '}
							<Text color="cyan">
								{detail.dependedByKeys.map((k) => k.path.join('/')).join(', ')}
							</Text>
						</Text>
					)}
				</Box>
			)}

			{phase.kind === 'confirm' && (
				<Box marginTop={1} flexDirection="column">
					<Text color="yellow">Materialise &quot;{assetName}&quot;?</Text>
					<Text>
						<Text color="green">y</Text> confirm · <Text color="red">n</Text> cancel
					</Text>
				</Box>
			)}
			{phase.kind === 'launching' && (
				<Box marginTop={1}>
					<Spinner label="Launching..." />
				</Box>
			)}
			{phase.kind === 'error' && (
				<Box marginTop={1} flexDirection="column">
					<Text color="red">Launch failed: {phase.message}</Text>
					<Text dimColor>↵ dismiss</Text>
				</Box>
			)}

			<Box marginTop={1} flexDirection="column">
				{rows.map((r, i) => {
					const selected = i === cursor
					const nonInteractive = !r.openable
					const labelColour = r.colour
					return (
						<Box key={`${r.kind}-${i}-${r.label}`}>
							<Box width={2} flexShrink={0}>
								<Text color="cyan">{selected ? '›' : ' '}</Text>
							</Box>
							<Box width={maxLabel + 2} flexShrink={0}>
								<Text color={labelColour} bold={!nonInteractive}>
									{r.label}
								</Text>
							</Box>
							<Box flexGrow={1}>
								<Text color={selected ? 'cyan' : undefined} wrap="truncate">
									{r.value}
								</Text>
							</Box>
							<Box width={2} flexShrink={0}>
								<Text>{r.openable ? '›' : ' '}</Text>
							</Box>
						</Box>
					)
				})}
				{!parquetExists && (
					<Box marginTop={1}>
						<Text>(no local parquet for inspect/sample)</Text>
					</Box>
				)}
			</Box>

			{staticMeta.length > 0 && (
				<Box marginTop={2} flexDirection="column">
					{(() => {
						const maxStaticLabel = Math.max(...staticMeta.map((m) => m.label.length))
						return staticMeta.map((m, i) => (
							<Box key={`${i}-${m.label}`}>
								<Box width={maxStaticLabel + 2} flexShrink={0}>
									<Text bold>{m.label}</Text>
								</Box>
								<Box flexGrow={1}>
									<Text wrap="truncate">{m.value}</Text>
								</Box>
							</Box>
						))
					})()}
				</Box>
			)}
		</Box>
	)
}
