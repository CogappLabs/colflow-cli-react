/**
 * UI strings for the TUI. Centralised so future translations / wording tweaks
 * happen in one place. Components import `t.<screen>.<key>`.
 *
 * Conventions:
 * - `keymap` strings are footer hint bars (dim).
 * - `confirm` strings include the action verb in the natural language form.
 * - Functions for strings that take parameters.
 */

export const t = {
	app: {
		title: 'colflow',
		ctrlCExit: '(ctrl+c to exit)',
	},

	menu: {
		title: 'What would you like to do?',
		items: {
			runs: { label: 'Runs', hint: 'browse recent runs + drill into assets' },
			assets: { label: 'Assets', hint: 'browse all assets, materialisation + stale status' },
			jobs: { label: 'Jobs', hint: 'list all jobs in the repository' },
			sensors: { label: 'Sensors', hint: 'list sensors with status + recent ticks' },
			esCheck: { label: 'Elasticsearch', hint: '(TODO)' },
			reload: { label: 'Reload Dagster', hint: 'reload the code location after editing python' },
			quit: { label: 'Quit', hint: '' },
		},
	},

	runs: {
		header: {
			status: 'STATUS',
			job: 'JOB',
			started: 'STARTED',
			age: 'AGE',
			duration: 'DURATION',
			assets: 'ASSETS',
			id: 'ID',
		},
		empty: 'No runs found.',
		diffMarked: (n: number) => `${n}/2 marked.`,
		diffPressOther: 'Press d on another run, or D to clear',
		diffReady: 'Press d to compare · D to clear',
	},

	run: {
		statusLabel: 'Status:',
		assetsHeader: 'Assets / steps',
		stepHeader: { status: 'STATUS', asset: 'ASSET', time: 'TIME', checks: 'CHECKS' },
		empty: 'No steps recorded.',
		cancelConfirm: (id: string) => `Cancel run ${id}?`,
		cancelling: 'Cancelling...',
		cancelled: (status: string) => `Cancelled — status: ${status}`,
		cancelFailed: (msg: string) => `Cancel failed: ${msg}`,
	},

	assets: {
		header: { asset: 'ASSET', group: 'GROUP', lastMat: 'LAST MAT', stale: 'STALE', checks: 'CHECKS' },
		empty: 'No assets found.',
		never: 'never',
		filterEdit: 'c clear · / edit',
		selectedHint: 'm materialise · A clear',
		selectedLabel: 'Selected:',
		materialiseConfirm: (n: number, names: string) => `Materialise ${n} asset(s)? ${names}`,
	},

	asset: {
		failureLabel: 'FAILURE',
		passLabel: 'PASS',
		failLabel: 'FAIL',
		materialiseLabel: 'MATERIALISE',
		schemaLabel: 'SCHEMA',
		sampleLabel: 'SAMPLE',
		sampleByIdLabel: 'SAMPLE BY ID',
		actionDescriptions: {
			materialise: 'launch run for this asset',
			sample: 'first N rows',
			sampleById: 'filter rows by column = value',
		},
		groupLabel: 'Group:',
		staleLabel: 'Stale:',
		kindsLabel: 'Kinds:',
		jobsLabel: 'Jobs:',
		lastMatLabel: 'Last mat:',
		inRunLabel: 'In run:',
		upstreamLabel: 'Upstream:',
		downstreamLabel: 'Downstream:',
		noLocalParquet: '(no local parquet for inspect/sample)',
		materialiseConfirm: (name: string) => `Materialise "${name}"?`,
		launching: 'Launching...',
		launchFailed: (msg: string) => `Launch failed: ${msg}`,
		claudeNoTarget: 'No failure or failed check selected.',
	},

	assetSchema: {
		header: { name: 'NAME', populated: 'POPULATED', percent: '%' },
	},

	assetSample: {
		emptyFiltered: (filter: string) => `(no rows matched ${filter})`,
		empty: '(no rows)',
		rowCounter: (cur: number, total: number) => `Row ${cur} of ${total}`,
		filterLabel: 'filter:',
		fullRowFooter: '↑/↓ row · ↵ full row · esc back',
	},

	assetSampleById: {
		columnPrompt: 'Column to filter on',
		columnPromptDefault: (col: string) => `Column to filter on (default ${col}):`,
		valuePrompt: 'Value for',
		footer: '↵ submit · esc back',
		loading: 'Reading parquet...',
	},

	jobs: {
		header: { job: 'JOB', description: 'DESCRIPTION', assets: 'ASSETS' },
		empty: 'No jobs found.',
	},

	job: {
		internal: '(internal job, cannot launch)',
		descriptionHeader: 'Description',
		assetsHeader: (n: number | '...') => `Assets (${n})`,
		assetsLoading: 'Loading assets...',
		assetsError: 'Error loading assets',
		assetsEmpty: '(no assets)',
		launchPrompt: (key: string) => `Press ${key} to launch this job.`,
		launchConfirm: (name: string) => `Launch job "${name}" with default config?`,
		launching: 'Launching...',
		launched: (id: string) => `Launched run ${id}`,
		launchedHint: '↵ open run',
		launchFailed: 'Launch failed:',
		launchDismissHint: '↵ dismiss · esc back',
	},

	sensors: {
		header: { sensor: 'SENSOR', status: 'STATUS', nextTick: 'NEXT TICK' },
		empty: 'No sensors found.',
		recentTicks: (name: string) => `Recent ticks: ${name}`,
	},

	tail: {
		paused: ' PAUSED',
		filterPrefix: 'filter:',
		waiting: 'Waiting for events...',
		footer: 'space pause · / filter · c clear · ↑/↓ scroll · G bottom · q back',
	},

	checkDetail: {
		noMetadata: '(no metadata)',
		openFirstHint: '↵ open detail of first ›',
	},

	metadataDetail: {
		empty: '(empty)',
		rowsSuffix: 'rows',
		linesSuffix: 'lines',
	},

	runsDiff: {
		statusLabel: 'Status',
		jobLabel: 'Job',
		durationLabel: 'Duration',
		startedLabel: 'Started',
		succeededLabel: 'Succeeded',
		failedLabel: 'Failed',
		stepHeader: 'STEP',
		diffCount: (n: number) => `${n} step(s) differ`,
		noDifferences: '(no differences)',
	},

	details: {
		linesOnly: (n: number) => `${n} lines`,
		position: (start: number, end: number, total: number, marker: string) =>
			`${start}-${end}/${total}${marker}`,
	},

	reload: {
		title: 'Reload Dagster code location',
		confirm: 'Reload now?',
		reloading: 'Reloading...',
		failed: (msg: string) => `Reload failed: ${msg}`,
		backHint: '↵ back',
	},

	esCheck: {
		connecting: 'Connecting to Elasticsearch...',
		urlLabel: 'URL:',
		clusterLabel: 'Cluster:',
		statusLabel: 'Status:',
		nodesLabel: 'Nodes:',
		shardsLabel: 'Shards:',
		dataPrefix: '(data:',
		activeSuffix: 'active /',
		primarySuffix: 'primary',
		unassignedSuffix: 'unassigned',
		hintLabel: 'Hint:',
		filterLabel: 'filter:',
		filterControls: 'c clear · / edit',
		indicesTab: (n: number) => `[i] Indices (${n})`,
		aliasesTab: (n: number) => `[a] Aliases (${n})`,
		noIndices: '(no indices)',
		noAliases: '(no aliases)',
		header: { index: 'INDEX', health: 'HEALTH', docs: 'DOCS', size: 'SIZE' },
		aliasHeader: { alias: 'ALIAS', index: 'INDEX', write: 'WRITE' },
	},

	common: {
		yConfirmNCancel: 'y confirm · n cancel',
		dismissHint: '↵ dismiss',
		backHint: '↵ back',
		loading: 'Loading...',
		errorPrefix: 'Error:',
		notFound: (what: string) => `${what} not found`,
		scrollPosition: (cur: number, total: number, up: string, down: string) =>
			`${cur}/${total} ${up}${down}`,
	},

	footer: {
		menu: '↑/↓ select · ↵ open · q quit',
		runs: '↑/↓ · ↵ open · d mark/diff · D clear · q back',
		run: '↑/↓ · ↵ asset · t tail · x cancel · esc/← back',
		tail: 'space pause · / filter · c clear · ↑/↓ scroll · esc/← back',
		asset:
			'↑/↓ · ↵ open · m materialise · r recheck · c claude · s schema · d sample · i by-ID · esc/← back',
		assets: 'space select · m materialise · a/A all/none · / search · ↵ open · esc/← back',
		assetSchema: '↑/↓ pgUp/pgDn g/G · esc/← back',
		assetSample: '↑/↓ row · ↵ full row · esc/← back',
		assetSampleById: '↵ submit · esc back',
		jobs: '↑/↓ pgUp/pgDn g/G · ↵ open · esc/← back',
		jobDetail: 'l launch · esc/← back',
		sensors: '↑/↓ pgUp/pgDn g/G · esc/← back',
		reload: 'y confirm · n/esc cancel',
		runsDiff: '↑/↓ pgUp/pgDn · esc/← back',
		details: '↑/↓ scroll · g/G top/bottom · pgUp/pgDn · esc/← back',
		launchedRun: '',
	},
}
