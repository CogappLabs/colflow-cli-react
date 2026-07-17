import { GraphQLClient } from 'graphql-request'

export interface ClientOptions {
	url: string
	auth?: string
	/** HTTP Basic credentials as "user:password" (e.g. an instance behind a Traefik basicauth middleware). */
	basicAuth?: string
}

export function makeClient({ url, auth, basicAuth }: ClientOptions): GraphQLClient {
	const endpoint = `${url.replace(/\/$/, '')}/graphql`
	const headers: Record<string, string> = {}
	if (auth) headers['Dagster-Cloud-Api-Token'] = auth
	// Falls back to the env so callers that don't thread basicAuth through their
	// options (most commands) still authenticate against a Basic-protected box.
	const basic = basicAuth ?? process.env.DAGSTER_BASIC_AUTH
	if (basic) headers.Authorization = `Basic ${btoa(basic)}`
	return new GraphQLClient(endpoint, { headers })
}

export interface Run {
	runId: string
	jobName: string
	status: string
	startTime: number | string | null
	endTime: number | string | null
	assetSelection?: { path: string[] }[] | null
}

export interface RunEvent {
	message: string
	timestamp: number | string
	stepKey: string | null
	level: string
}

export interface RunDetail extends Run {
	stats: { stepsSucceeded: number; stepsFailed: number } | null
	events: RunEvent[]
}

export interface StepFailure {
	stepKey: string
	error: { message: string; stack: string | null; causes: { message: string }[] }
}

const RUNS_QUERY = `
	query Runs($limit: Int!, $statuses: [RunStatus!]) {
		runsOrError(limit: $limit, filter: { statuses: $statuses }) {
			... on Runs {
				results {
					runId jobName status startTime endTime
					assetSelection { path }
				}
			}
			... on PythonError { message }
			... on InvalidPipelineRunsFilterError { message }
		}
	}
`

export async function fetchRuns(
	client: GraphQLClient,
	limit = 25,
	statuses?: string[],
): Promise<Run[]> {
	const data = await client.request<{
		runsOrError: { results?: Run[]; message?: string }
	}>(RUNS_QUERY, { limit, statuses: statuses ?? null })
	if (data.runsOrError.message) throw new Error(data.runsOrError.message)
	return data.runsOrError.results ?? []
}

const RUN_QUERY = `
	query Run($id: ID!) {
		runOrError(runId: $id) {
			... on Run {
				runId jobName status startTime endTime
				stats { ... on RunStatsSnapshot { stepsSucceeded stepsFailed } }
				eventConnection {
					events {
						... on MessageEvent { message timestamp stepKey level }
					}
				}
			}
			... on RunNotFoundError { message }
			... on PythonError { message }
		}
	}
`

export async function fetchRun(client: GraphQLClient, id: string): Promise<RunDetail> {
	const data = await client.request<{
		runOrError: Partial<Run> & {
			stats?: RunDetail['stats']
			eventConnection?: { events: RunEvent[] }
			message?: string
		}
	}>(RUN_QUERY, { id })
	const r = data.runOrError
	if (r.message) throw new Error(r.message)
	return {
		runId: r.runId ?? id,
		jobName: r.jobName ?? '',
		status: r.status ?? '',
		startTime: r.startTime ?? null,
		endTime: r.endTime ?? null,
		stats: r.stats ?? null,
		events: (r.eventConnection?.events ?? []).filter((e) => e.message),
	}
}

export interface RunStep {
	stepKey: string
	status: 'SUCCESS' | 'FAILURE' | 'STARTED' | 'SKIPPED' | 'UPSTREAM_FAILED' | 'PENDING'
	assetKey: string[] | null
	startTime: number | null
	endTime: number | null
	isCheck: boolean
	failedChecks: string[]
	warnedChecks: string[]
	passedCheckCount: number
}

const RUN_STEPS_QUERY = `
	query RunSteps($id: ID!) {
		runOrError(runId: $id) {
			... on Run {
				stepStats {
					stepKey
					status
					startTime
					endTime
				}
				eventConnection {
					events {
						__typename
						... on ExecutionStepStartEvent { stepKey timestamp }
						... on ExecutionStepSuccessEvent { stepKey timestamp }
						... on ExecutionStepFailureEvent { stepKey timestamp }
						... on ExecutionStepSkippedEvent { stepKey timestamp }
						... on ExecutionStepUpForRetryEvent { stepKey timestamp }
						... on MaterializationEvent { stepKey timestamp assetKey { path } }
						... on AssetCheckEvaluationEvent {
							stepKey
							evaluation {
								checkName
								assetKey { path }
								success
								severity
							}
						}
					}
				}
			}
			... on RunNotFoundError { message }
			... on PythonError { message }
		}
	}
`

interface StepStats {
	stepKey: string
	status: string | null
	startTime: number | string | null
	endTime: number | string | null
}

interface StepEvent {
	__typename: string
	stepKey?: string
	assetKey?: { path: string[] }
	evaluation?: {
		checkName: string
		assetKey: { path: string[] }
		success: boolean
		severity: string
	}
}

export async function fetchRunSteps(client: GraphQLClient, id: string): Promise<RunStep[]> {
	const data = await client.request<{
		runOrError: {
			stepStats?: StepStats[]
			eventConnection?: { events: StepEvent[] }
			message?: string
		}
	}>(RUN_STEPS_QUERY, { id })
	const r = data.runOrError
	if (r.message) throw new Error(r.message)

	const stepToAsset = new Map<string, string[]>()
	const checkStepKeys = new Set<string>()
	interface CheckAgg {
		failed: string[]
		warned: string[]
		passed: number
	}
	const checksByAsset = new Map<string, CheckAgg>()
	for (const ev of r.eventConnection?.events ?? []) {
		if (ev.__typename === 'MaterializationEvent' && ev.stepKey && ev.assetKey) {
			stepToAsset.set(ev.stepKey, ev.assetKey.path)
		}
		if (ev.__typename === 'AssetCheckEvaluationEvent') {
			if (ev.stepKey) checkStepKeys.add(ev.stepKey)
			if (ev.evaluation) {
				const key = ev.evaluation.assetKey.path.join('/')
				const agg = checksByAsset.get(key) ?? { failed: [], warned: [], passed: 0 }
				if (ev.evaluation.success) {
					agg.passed++
				} else if (ev.evaluation.severity === 'WARN') {
					agg.warned.push(ev.evaluation.checkName)
				} else {
					agg.failed.push(ev.evaluation.checkName)
				}
				checksByAsset.set(key, agg)
			}
		}
	}

	const stats = r.stepStats ?? []
	const normalise = (s: string | null): RunStep['status'] => {
		switch (s) {
			case 'SUCCESS':
				return 'SUCCESS'
			case 'FAILURE':
				return 'FAILURE'
			case 'IN_PROGRESS':
			case 'STARTED':
				return 'STARTED'
			case 'SKIPPED':
				return 'SKIPPED'
			case 'UPSTREAM_FAILED':
				return 'UPSTREAM_FAILED'
			default:
				return 'PENDING'
		}
	}
	const toNum = (v: number | string | null): number | null => {
		if (v == null) return null
		const n = typeof v === 'string' ? Number(v) : v
		return Number.isFinite(n) ? n : null
	}
	return stats
		.map((s) => {
			const assetKey = stepToAsset.get(s.stepKey) ?? null
			const agg = assetKey ? checksByAsset.get(assetKey.join('/')) : undefined
			return {
				stepKey: s.stepKey,
				status: normalise(s.status),
				assetKey,
				startTime: toNum(s.startTime),
				endTime: toNum(s.endTime),
				isCheck: checkStepKeys.has(s.stepKey),
				failedChecks: agg?.failed ?? [],
				warnedChecks: agg?.warned ?? [],
				passedCheckCount: agg?.passed ?? 0,
			}
		})
		.filter((s) => !s.isCheck)
}

export interface TableColumn {
	name: string
	type: string
	description: string | null
	constraints: { nullable: boolean; unique: boolean; other: string[] }
}

export interface MetadataEntry {
	label: string
	description: string | null
	__typename: string
	text?: string
	intValue?: number
	floatValue?: number
	boolValue?: boolean
	path?: string
	jsonString?: string
	url?: string
	mdStr?: string
	schema?: { columns: TableColumn[] }
	table?: { schema: { columns: TableColumn[] }; records: string[] }
}

export interface AssetMaterializationDetail {
	timestamp: number | string
	runId: string
	assetKey: string[]
	metadataEntries: MetadataEntry[]
}

export interface AssetCheckEval {
	checkName: string
	assetKey: string[]
	success: boolean
	severity: string
	metadataEntries: MetadataEntry[]
}

const RUN_ASSET_DETAIL_QUERY = `
	query RunAssetDetail($id: ID!) {
		runOrError(runId: $id) {
			... on Run {
				eventConnection {
					events {
						__typename
						... on MaterializationEvent {
							stepKey
							timestamp
							assetKey { path }
							metadataEntries {
								label description __typename
								... on IntMetadataEntry { intValue }
								... on FloatMetadataEntry { floatValue }
								... on TextMetadataEntry { text }
								... on PathMetadataEntry { path }
								... on JsonMetadataEntry { jsonString }
								... on BoolMetadataEntry { boolValue }
								... on UrlMetadataEntry { url }
								... on MarkdownMetadataEntry { mdStr }
								... on TableSchemaMetadataEntry {
									schema {
										columns {
											name
											type
											description
											constraints { nullable unique other }
										}
									}
								}
								... on TableMetadataEntry {
									table {
										records
										schema {
											columns { name type }
										}
									}
								}
							}
						}
						... on AssetCheckEvaluationEvent {
							stepKey
							evaluation {
								checkName
								assetKey { path }
								success
								severity
								metadataEntries {
									label description __typename
									... on IntMetadataEntry { intValue }
									... on FloatMetadataEntry { floatValue }
									... on TextMetadataEntry { text }
									... on PathMetadataEntry { path }
									... on JsonMetadataEntry { jsonString }
									... on BoolMetadataEntry { boolValue }
									... on UrlMetadataEntry { url }
									... on MarkdownMetadataEntry { mdStr }
									... on TableMetadataEntry {
										table {
											records
											schema { columns { name type } }
										}
									}
								}
							}
						}
						... on ExecutionStepFailureEvent {
							stepKey
							timestamp
							message
							error { message stack causes { message stack } }
						}
					}
				}
			}
			... on RunNotFoundError { message }
			... on PythonError { message }
		}
	}
`

interface RawMatEvent {
	__typename: string
	stepKey?: string
	timestamp?: number | string
	assetKey?: { path: string[] }
	metadataEntries?: MetadataEntry[]
	message?: string
	error?: {
		message: string
		stack: string | null
		causes: { message: string; stack: string | null }[]
	}
	evaluation?: {
		checkName: string
		assetKey: { path: string[] }
		success: boolean
		severity: string
		metadataEntries: MetadataEntry[]
	}
}

export interface AssetFailure {
	timestamp: number | string | null
	message: string
	error: {
		message: string
		stack: string | null
		causes: { message: string; stack: string | null }[]
	} | null
}

export interface RunAssetDetail {
	materialisation: AssetMaterializationDetail | null
	checks: AssetCheckEval[]
	failure: AssetFailure | null
}

export async function fetchRunAssetDetail(
	client: GraphQLClient,
	runId: string,
	stepKey: string,
): Promise<RunAssetDetail> {
	const data = await client.request<{
		runOrError: { eventConnection?: { events: RawMatEvent[] }; message?: string }
	}>(RUN_ASSET_DETAIL_QUERY, { id: runId })
	if (data.runOrError.message) throw new Error(data.runOrError.message)
	const events = data.runOrError.eventConnection?.events ?? []
	let mat: AssetMaterializationDetail | null = null
	let failure: AssetFailure | null = null
	const checks: AssetCheckEval[] = []

	// First pass: find materialisation for this stepKey to learn its assetKey.
	for (const ev of events) {
		if (ev.stepKey !== stepKey) continue
		if (ev.__typename === 'MaterializationEvent' && ev.assetKey) {
			mat = {
				timestamp: ev.timestamp ?? 0,
				runId,
				assetKey: ev.assetKey.path,
				metadataEntries: ev.metadataEntries ?? [],
			}
		}
		if (ev.__typename === 'ExecutionStepFailureEvent') {
			failure = {
				timestamp: ev.timestamp ?? null,
				message: ev.message ?? '',
				error: ev.error ?? null,
			}
		}
	}

	// Asset checks run in their own step (e.g. `<asset>_schema_check`).
	// Match by assetKey (from materialisation) or fall back to stepKey-prefix.
	const assetKeyJoined = mat?.assetKey.join('/') ?? null
	for (const ev of events) {
		if (ev.__typename !== 'AssetCheckEvaluationEvent' || !ev.evaluation) continue
		const evAssetKey = ev.evaluation.assetKey.path.join('/')
		const matchesAsset = assetKeyJoined && evAssetKey === assetKeyJoined
		const matchesStep = ev.stepKey === stepKey
		if (!matchesAsset && !matchesStep) continue
		checks.push({
			checkName: ev.evaluation.checkName,
			assetKey: ev.evaluation.assetKey.path,
			success: ev.evaluation.success,
			severity: ev.evaluation.severity,
			metadataEntries: ev.evaluation.metadataEntries,
		})
	}

	return { materialisation: mat, checks, failure }
}

export interface AssetListNode {
	assetKey: { path: string[] }
	groupName: string | null
	description: string | null
	kinds: string[]
	staleStatus: string
	hasAssetChecks: boolean
	assetMaterializations: { timestamp: number | string; runId: string }[]
}

const ASSETS_QUERY = `
	query Assets {
		assetNodes {
			assetKey { path }
			groupName
			description
			kinds
			staleStatus
			hasAssetChecks
			assetMaterializations(limit: 1) { timestamp runId }
		}
	}
`

export async function fetchAssets(client: GraphQLClient): Promise<AssetListNode[]> {
	const data = await client.request<{ assetNodes: AssetListNode[] }>(ASSETS_QUERY)
	return data.assetNodes
}

export interface Job {
	name: string
	description: string | null
}

const JOBS_QUERY = `
	query Jobs {
		repositoriesOrError {
			... on RepositoryConnection {
				nodes {
					jobs { name description }
				}
			}
		}
	}
`

export interface JobAssetNode {
	assetKey: { path: string[] }
	groupName: string | null
	jobNames: string[]
	dependencyKeys: { path: string[] }[]
}

const JOB_ASSETS_QUERY = `
	query JobAssets {
		assetNodes {
			assetKey { path }
			groupName
			jobNames
			dependencyKeys { path }
		}
	}
`

export async function fetchJobAssets(
	client: GraphQLClient,
	jobName: string,
): Promise<JobAssetNode[]> {
	const data = await client.request<{ assetNodes: JobAssetNode[] }>(JOB_ASSETS_QUERY)
	return data.assetNodes.filter((n) => n.jobNames.includes(jobName))
}

export async function fetchJobAssetCounts(client: GraphQLClient): Promise<Map<string, number>> {
	const data = await client.request<{ assetNodes: { jobNames: string[] }[] }>(
		`query JobAssetCounts { assetNodes { jobNames } }`,
	)
	const counts = new Map<string, number>()
	for (const n of data.assetNodes) {
		for (const j of n.jobNames) counts.set(j, (counts.get(j) ?? 0) + 1)
	}
	return counts
}

export async function fetchJobs(client: GraphQLClient): Promise<Job[]> {
	const data = await client.request<{
		repositoriesOrError: { nodes?: { jobs: Job[] }[] }
	}>(JOBS_QUERY)
	const nodes = data.repositoriesOrError.nodes ?? []
	const out: Job[] = []
	for (const n of nodes) for (const j of n.jobs) out.push(j)
	return out
}

export interface AssetDetailNode {
	assetKey: { path: string[] }
	groupName: string | null
	description: string | null
	computeKind: string | null
	kinds: string[]
	staleStatus: string
	jobNames: string[]
	dependencyKeys: { path: string[] }[]
	dependedByKeys: { path: string[] }[]
	assetMaterializations: {
		timestamp: number | string
		runId: string
		metadataEntries?: MetadataEntry[]
	}[]
	staleCauses: { key: { path: string[] }; reason: string; category: string }[]
}

const ASSET_DETAIL_QUERY = `
	query AssetDetail($assetKey: AssetKeyInput!) {
		assetNodeOrError(assetKey: $assetKey) {
			__typename
			... on AssetNode {
				assetKey { path }
				groupName
				description
				computeKind
				kinds
				staleStatus
				jobNames
				dependencyKeys { path }
				dependedByKeys { path }
				assetMaterializations(limit: 5) {
					timestamp
					runId
					metadataEntries {
						label description __typename
						... on PathMetadataEntry { path }
						... on TextMetadataEntry { text }
					}
				}
				staleCauses { key { path } reason category }
			}
		}
	}
`

export async function fetchAssetDetail(
	client: GraphQLClient,
	path: string[],
): Promise<AssetDetailNode | null> {
	const data = await client.request<{
		assetNodeOrError: AssetDetailNode & { __typename: string }
	}>(ASSET_DETAIL_QUERY, { assetKey: { path } })
	if (data.assetNodeOrError.__typename !== 'AssetNode') return null
	return data.assetNodeOrError
}

export interface WorkspaceLocation {
	name: string
	workingDirectory: string | null
	moduleName: string | null
}

const WORKSPACE_QUERY = `
	query Workspace {
		workspaceOrError {
			... on Workspace {
				locationEntries {
					name
					displayMetadata { key value }
				}
			}
		}
	}
`

export async function fetchWorkspaceLocation(
	client: GraphQLClient,
): Promise<WorkspaceLocation | null> {
	const data = await client.request<{
		workspaceOrError: {
			locationEntries?: { name: string; displayMetadata: { key: string; value: string }[] }[]
		}
	}>(WORKSPACE_QUERY)
	const entry = data.workspaceOrError.locationEntries?.[0]
	if (!entry) return null
	const meta = new Map(entry.displayMetadata.map((m) => [m.key, m.value]))
	return {
		name: entry.name,
		workingDirectory: meta.get('working_directory') ?? null,
		moduleName: meta.get('module_name') ?? null,
	}
}

interface Repository {
	name: string
	location: { name: string }
}

const REPO_QUERY = `
	query Repo {
		repositoriesOrError {
			... on RepositoryConnection {
				nodes { name location { name } }
			}
		}
	}
`

async function getRepository(client: GraphQLClient): Promise<Repository> {
	const data = await client.request<{
		repositoriesOrError: { nodes?: Repository[] }
	}>(REPO_QUERY)
	const repo = data.repositoriesOrError.nodes?.[0]
	if (!repo) throw new Error('No repository found')
	return repo
}

const LAUNCH_RUN_MUTATION = `
	mutation Launch($params: ExecutionParams!) {
		launchRun(executionParams: $params) {
			__typename
			... on LaunchRunSuccess { run { runId } }
			... on InvalidStepError { invalidStepKey }
			... on PipelineNotFoundError { message }
			... on RunConflict { message }
			... on UnauthorizedError { message }
			... on PythonError { message }
			... on RunConfigValidationInvalid {
				pipelineName
				errors { message reason path }
			}
		}
	}
`

const TERMINATE_RUN_MUTATION = `
	mutation Terminate($runId: String!) {
		terminateRun(runId: $runId) {
			... on TerminateRunSuccess { run { runId status } }
			... on TerminateRunFailure { message }
			... on RunNotFoundError { message }
			... on UnauthorizedError { message }
			... on PythonError { message }
		}
	}
`

export async function terminateRun(client: GraphQLClient, runId: string): Promise<string> {
	const data = await client.request<{
		terminateRun: { run?: { runId: string; status: string }; message?: string }
	}>(TERMINATE_RUN_MUTATION, { runId })
	if (data.terminateRun.message) throw new Error(data.terminateRun.message)
	if (!data.terminateRun.run) throw new Error('terminateRun: unexpected response')
	return data.terminateRun.run.status
}

export interface AssetCheckSelection {
	assetPath: string[]
	checkName: string
}

export async function launchAssetCheckRun(
	client: GraphQLClient,
	selections: AssetCheckSelection[],
): Promise<string> {
	const repo = await getRepository(client)
	const checks = selections.map((s) => ({
		assetKey: { path: s.assetPath },
		name: s.checkName,
	}))
	const data = await client.request<{
		launchRun: {
			__typename: string
			run?: { runId: string }
			message?: string
			invalidStepKey?: string
		}
	}>(LAUNCH_RUN_MUTATION, {
		params: {
			selector: {
				pipelineName: '__ASSET_JOB',
				repositoryName: repo.name,
				repositoryLocationName: repo.location.name,
				assetCheckSelection: checks,
				assetSelection: [],
			},
		},
	})
	const r = data.launchRun
	if (r.invalidStepKey) throw new Error(`invalid step key: ${r.invalidStepKey}`)
	if (r.message) throw new Error(r.message)
	if (!r.run) throw new Error(`launchAssetCheckRun: unexpected response (${r.__typename})`)
	return r.run.runId
}

const RELOAD_MUTATION = `
	mutation Reload($locationName: String!) {
		reloadRepositoryLocation(repositoryLocationName: $locationName) {
			__typename
			... on WorkspaceLocationEntry { name loadStatus }
			... on ReloadNotSupported { message }
			... on RepositoryLocationNotFound { message }
			... on UnauthorizedError { message }
			... on PythonError { message }
		}
	}
`

export interface ReloadResult {
	status: string
	message: string
}

export async function reloadLocation(client: GraphQLClient): Promise<ReloadResult> {
	const repo = await getRepository(client)
	const data = await client.request<{
		reloadRepositoryLocation: {
			__typename: string
			loadStatus?: string
			message?: string
		}
	}>(RELOAD_MUTATION, { locationName: repo.location.name })
	const r = data.reloadRepositoryLocation
	if (r.loadStatus) return { status: r.loadStatus, message: '' }
	return { status: 'ERROR', message: r.message ?? '' }
}

export interface StaleAssetNode {
	assetKey: { path: string[] }
	groupName: string | null
	staleStatus: string
	staleCauses: { key: { path: string[] }; reason: string; category: string }[]
	assetMaterializations: { timestamp: number | string }[]
}

const STALE_QUERY = `
	query Stale {
		assetNodes {
			assetKey { path }
			groupName
			staleStatus
			staleCauses { key { path } reason category }
			assetMaterializations(limit: 1) { timestamp }
		}
	}
`

export async function fetchStaleAssets(client: GraphQLClient): Promise<StaleAssetNode[]> {
	const data = await client.request<{ assetNodes: StaleAssetNode[] }>(STALE_QUERY)
	return data.assetNodes.filter((a) => a.staleStatus !== 'FRESH')
}

export interface ConfigField {
	name: string
	description: string | null
	isRequired: boolean
	configTypeKey: string
	defaultValueAsJson: string | null
}

const JOB_CONFIG_QUERY = `
	query JobConfig($selector: PipelineSelector!) {
		runConfigSchemaOrError(selector: $selector) {
			... on RunConfigSchema {
				rootConfigType {
					... on CompositeConfigType {
						fields { name description isRequired configTypeKey defaultValueAsJson }
					}
				}
			}
			... on PipelineNotFoundError { message }
			... on ModeNotFoundError { message }
			... on PythonError { message }
		}
	}
`

export async function fetchJobConfig(
	client: GraphQLClient,
	jobName: string,
): Promise<{ jobName: string; fields: ConfigField[] }> {
	const repo = await getRepository(client)
	const data = await client.request<{
		runConfigSchemaOrError: {
			rootConfigType?: { fields?: ConfigField[] }
			message?: string
		}
	}>(JOB_CONFIG_QUERY, {
		selector: {
			pipelineName: jobName,
			repositoryName: repo.name,
			repositoryLocationName: repo.location.name,
		},
	})
	if (data.runConfigSchemaOrError.message) {
		throw new Error(data.runConfigSchemaOrError.message)
	}
	return {
		jobName,
		fields: data.runConfigSchemaOrError.rootConfigType?.fields ?? [],
	}
}

export interface SensorState {
	name: string
	status: string
	nextTick: { timestamp: number | string } | null
	ticks: {
		status: string
		timestamp: number | string
		error: { message: string } | null
	}[]
}

const SENSORS_QUERY = `
	query Sensors($repoSelector: RepositorySelector!) {
		sensorsOrError(repositorySelector: $repoSelector) {
			... on Sensors {
				results {
					name
					sensorState {
						name status
						nextTick { timestamp }
						ticks(limit: 3) { status timestamp error { message } }
					}
				}
			}
			... on PythonError { message }
		}
	}
`

export async function fetchSensors(client: GraphQLClient): Promise<SensorState[]> {
	const repo = await getRepository(client)
	const data = await client.request<{
		sensorsOrError: {
			results?: { name: string; sensorState: SensorState }[]
			message?: string
		}
	}>(SENSORS_QUERY, {
		repoSelector: {
			repositoryName: repo.name,
			repositoryLocationName: repo.location.name,
		},
	})
	if (data.sensorsOrError.message) throw new Error(data.sensorsOrError.message)
	return (data.sensorsOrError.results ?? []).map((r) => r.sensorState)
}

export async function launchAssetRun(
	client: GraphQLClient,
	assetNames: string[],
	runConfigData: Record<string, unknown> = {},
): Promise<string> {
	const repo = await getRepository(client)
	const data = await client.request<{
		launchRun: {
			__typename: string
			run?: { runId: string }
			message?: string
		}
	}>(LAUNCH_RUN_MUTATION, {
		params: {
			selector: {
				pipelineName: '__ASSET_JOB',
				repositoryName: repo.name,
				repositoryLocationName: repo.location.name,
			},
			stepKeys: assetNames,
			runConfigData,
		},
	})
	const r = data.launchRun
	if (r.message) throw new Error(r.message)
	if (!r.run) throw new Error(`launchAssetRun: unexpected response (${r.__typename})`)
	return r.run.runId
}

export async function launchRun(
	client: GraphQLClient,
	jobName: string,
	runConfigData: Record<string, unknown> = {},
): Promise<string> {
	const repo = await getRepository(client)
	const data = await client.request<{
		launchRun: {
			__typename: string
			run?: { runId: string }
			message?: string
			invalidStepKey?: string
			errors?: { message: string; reason: string; path: string[] }[]
		}
	}>(LAUNCH_RUN_MUTATION, {
		params: {
			selector: {
				jobName,
				repositoryName: repo.name,
				repositoryLocationName: repo.location.name,
			},
			runConfigData,
		},
	})
	const r = data.launchRun
	if (r.errors && r.errors.length > 0) {
		const lines = r.errors.map((e) => {
			const p = e.path.length > 0 ? ` at ${e.path.join('.')}` : ''
			return `[${e.reason}]${p}: ${e.message}`
		})
		throw new Error(`Run config invalid:\n  ${lines.join('\n  ')}`)
	}
	if (r.invalidStepKey) throw new Error(`Invalid step key: ${r.invalidStepKey}`)
	if (r.message) throw new Error(r.message)
	if (!r.run) throw new Error(`launchRun: unexpected response (${r.__typename})`)
	return r.run.runId
}

export interface AssetGraphNode {
	assetKey: { path: string[] }
	groupName: string | null
	dependencyKeys: { path: string[] }[]
	dependedByKeys: { path: string[] }[]
}

const ASSET_GRAPH_QUERY = `
	query AssetGraph {
		assetNodes {
			assetKey { path }
			groupName
			dependencyKeys { path }
			dependedByKeys { path }
		}
	}
`

export async function fetchAssetGraph(client: GraphQLClient): Promise<AssetGraphNode[]> {
	const data = await client.request<{ assetNodes: AssetGraphNode[] }>(ASSET_GRAPH_QUERY)
	return data.assetNodes
}

const RUN_ERRORS_QUERY = `
	query RunErrors($id: ID!) {
		runOrError(runId: $id) {
			... on Run {
				eventConnection {
					events {
						... on ExecutionStepFailureEvent {
							stepKey
							error { message stack causes { message } }
						}
					}
				}
			}
			... on RunNotFoundError { message }
			... on PythonError { message }
		}
	}
`

export async function fetchRunErrors(client: GraphQLClient, id: string): Promise<StepFailure[]> {
	const data = await client.request<{
		runOrError: {
			eventConnection?: { events: Array<Partial<StepFailure>> }
			message?: string
		}
	}>(RUN_ERRORS_QUERY, { id })
	if (data.runOrError.message) throw new Error(data.runOrError.message)
	return (data.runOrError.eventConnection?.events ?? []).filter(
		(e): e is StepFailure => !!e.stepKey,
	)
}
