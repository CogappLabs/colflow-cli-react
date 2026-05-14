import { FullScreenBox } from 'fullscreen-ink'
import { Box, Text, useApp, useInput } from 'ink'
import { useEffect, useState } from 'react'
import { t } from './i18n/en.ts'
import type {
	AssetCheckEval,
	AssetListNode,
	Job,
	MetadataEntry,
	Run,
	RunStep,
} from '../client/index.ts'
import { fetchRun, makeClient } from '../client/index.ts'
import { AssetSample } from './screens/AssetSample.tsx'
import { AssetSampleById } from './screens/AssetSampleById.tsx'
import { AssetSchema } from './screens/AssetSchema.tsx'
import { AssetsList } from './screens/AssetsList.tsx'
import { AssetView } from './screens/AssetView.tsx'
import { Details } from './screens/Details.tsx'
import { JobDetail } from './screens/JobDetail.tsx'
import { JobsList } from './screens/JobsList.tsx'
import { CheckDetail } from './screens/CheckDetail.tsx'
import { Menu, type MenuChoice } from './screens/Menu.tsx'
import { MetadataDetail } from './screens/MetadataDetail.tsx'
import { Reload } from './screens/Reload.tsx'
import { RunDetail } from './screens/RunDetail.tsx'
import { RunsDiff } from './screens/RunsDiff.tsx'
import { RunsList } from './screens/RunsList.tsx'
import { SensorsList } from './screens/SensorsList.tsx'
import { Tail } from './screens/Tail.tsx'

interface Props {
	url: string
	auth?: string
}

type View =
	| { kind: 'menu' }
	| { kind: 'runs' }
	| { kind: 'run'; run: Run }
	| { kind: 'tail'; run: Run }
	| {
			kind: 'asset'
			assetPath: string[]
			runContext?: { runId: string; stepKey: string; runStatus?: string }
			back: View
	  }
	| { kind: 'assets' }
	| { kind: 'asset-schema'; parquetPath: string; assetName: string; back: View }
	| {
			kind: 'asset-sample'
			parquetPath: string
			assetName: string
			filters?: { path: string[]; value: string }[]
			back: View
	  }
	| { kind: 'asset-sample-by-id'; parquetPath: string; assetName: string; back: View }
	| { kind: 'jobs' }
	| { kind: 'sensors' }
	| { kind: 'reload' }
	| { kind: 'runs-diff'; runId1: string; runId2: string }
	| { kind: 'metadata'; entry: MetadataEntry; back: View }
	| { kind: 'check'; check: AssetCheckEval; back: View }
	| { kind: 'job-detail'; job: Job }
	| { kind: 'launched-run'; runId: string }
	| { kind: 'details'; title: string; body: string; back: View }

function viewLabel(v: View): string {
	switch (v.kind) {
		case 'menu':
			return 'Menu'
		case 'runs':
			return 'Runs'
		case 'run':
			return `Run ${v.run.runId.slice(0, 8)} (${v.run.jobName})`
		case 'tail':
			return `Tail ${v.run.runId.slice(0, 8)}`
		case 'asset':
			return `Asset ${v.assetPath.join('/')}`
		case 'assets':
			return 'Assets'
		case 'asset-schema':
			return `Schema: ${v.assetName}`
		case 'asset-sample':
			return `Sample: ${v.assetName}`
		case 'asset-sample-by-id':
			return `Sample by ID: ${v.assetName}`
		case 'jobs':
			return 'Jobs'
		case 'sensors':
			return 'Sensors'
		case 'reload':
			return 'Reload Dagster'
		case 'runs-diff':
			return `Diff ${v.runId1.slice(0, 8)} ↔ ${v.runId2.slice(0, 8)}`
		case 'metadata':
			return v.entry.label
		case 'check':
			return `Check: ${v.check.checkName}`
		case 'job-detail':
			return `Job ${v.job.name}`
		case 'launched-run':
			return `Launched ${v.runId.slice(0, 8)}`
		case 'details':
			return v.title
	}
}

function viewKeymap(v: View): string {
	switch (v.kind) {
		case 'menu':
			return t.footer.menu
		case 'runs':
			return t.footer.runs
		case 'run':
			return t.footer.run
		case 'tail':
			return t.footer.tail
		case 'asset':
			return t.footer.asset
		case 'assets':
			return t.footer.assets
		case 'asset-schema':
			return t.footer.assetSchema
		case 'asset-sample':
			return t.footer.assetSample
		case 'asset-sample-by-id':
			return t.footer.assetSampleById
		case 'jobs':
			return t.footer.jobs
		case 'sensors':
			return t.footer.sensors
		case 'reload':
			return t.footer.reload
		case 'runs-diff':
			return t.footer.runsDiff
		case 'metadata':
			return '↑/↓ pgUp/pgDn g/G · esc/← back'
		case 'check':
			return '↵ open detail · esc/← back'
		case 'job-detail':
			return t.footer.jobDetail
		case 'launched-run':
			return t.footer.launchedRun
		case 'details':
			return t.footer.details
	}
}

export function App({ url, auth }: Props) {
	const [view, setView] = useState<View>({ kind: 'menu' })
	const { exit } = useApp()

	useInput((input, key) => {
		if (key.ctrl && input === 'c') exit()
	})

	const onMenu = (choice: MenuChoice) => {
		if (choice === 'quit') {
			exit()
			return
		}
		if (choice === 'runs') setView({ kind: 'runs' })
		if (choice === 'assets') setView({ kind: 'assets' })
		if (choice === 'jobs') setView({ kind: 'jobs' })
		if (choice === 'sensors') setView({ kind: 'sensors' })
		if (choice === 'reload') setView({ kind: 'reload' })
	}

	let body: React.ReactNode
	switch (view.kind) {
		case 'details':
			body = <Details title={view.title} body={view.body} onBack={() => setView(view.back)} />
			break
		case 'asset': {
			const v = view
			body = (
				<AssetView
					url={url}
					auth={auth}
					path={v.assetPath}
					runContext={v.runContext}
					onBack={() => setView(v.back)}
					onSchema={(parquetPath, assetName) =>
						setView({ kind: 'asset-schema', parquetPath, assetName, back: v })
					}
					onSample={(parquetPath, assetName) =>
						setView({ kind: 'asset-sample', parquetPath, assetName, back: v })
					}
					onSampleById={(parquetPath, assetName) =>
						setView({ kind: 'asset-sample-by-id', parquetPath, assetName, back: v })
					}
					onLaunched={(runId) => setView({ kind: 'launched-run', runId })}
					onDetails={(title, b) => setView({ kind: 'details', title, body: b, back: v })}
					onMetadata={(entry) => setView({ kind: 'metadata', entry, back: v })}
					onCheck={(check) => setView({ kind: 'check', check, back: v })}
				/>
			)
			break
		}
		case 'run':
			body = (
				<RunDetailWithHotkeys
					url={url}
					auth={auth}
					run={view.run}
					onBack={() => setView({ kind: 'runs' })}
					onTail={() => setView({ kind: 'tail', run: view.run })}
					onSelectStep={(step) =>
						setView({
							kind: 'asset',
							assetPath: step.assetKey ?? [step.stepKey],
							runContext: {
								runId: view.run.runId,
								stepKey: step.stepKey,
								runStatus: view.run.status,
							},
							back: view,
						})
					}
				/>
			)
			break
		case 'tail':
			body = (
				<Tail
					url={url}
					auth={auth}
					runId={view.run.runId}
					onBack={() => setView({ kind: 'run', run: view.run })}
				/>
			)
			break
		case 'sensors':
			body = (
				<SensorsList
					url={url}
					auth={auth}
					onBack={() => setView({ kind: 'menu' })}
				/>
			)
			break
		case 'reload':
			body = <Reload url={url} auth={auth} onBack={() => setView({ kind: 'menu' })} />
			break
		case 'jobs':
			body = (
				<JobsList
					url={url}
					auth={auth}
					onSelect={(job) => setView({ kind: 'job-detail', job })}
					onBack={() => setView({ kind: 'menu' })}
				/>
			)
			break
		case 'job-detail': {
			const v = view
			body = (
				<JobDetail
					url={url}
					auth={auth}
					job={v.job}
					onBack={() => setView({ kind: 'jobs' })}
					onLaunched={(runId) => setView({ kind: 'launched-run', runId })}
					onSelectAsset={(assetPath) => setView({ kind: 'asset', assetPath, back: v })}
				/>
			)
			break
		}
		case 'launched-run':
			body = (
				<LaunchedRunBridge
					url={url}
					auth={auth}
					runId={view.runId}
					onOpen={(run) => setView({ kind: 'run', run })}
					onBack={() => setView({ kind: 'jobs' })}
				/>
			)
			break
		case 'asset-schema':
			body = (
				<AssetSchema
					parquetPath={view.parquetPath}
					assetName={view.assetName}
					onBack={() => setView(view.back)}
				/>
			)
			break
		case 'asset-sample':
			body = (
				<AssetSample
					parquetPath={view.parquetPath}
					assetName={view.assetName}
					filters={view.filters}
					onBack={() => setView(view.back)}
					onDetails={(title, b) => setView({ kind: 'details', title, body: b, back: view })}
				/>
			)
			break
		case 'asset-sample-by-id': {
			const v = view
			body = (
				<AssetSampleById
					parquetPath={v.parquetPath}
					assetName={v.assetName}
					onBack={() => setView(v.back)}
					onSubmit={(column, value) =>
						setView({
							kind: 'asset-sample',
							parquetPath: v.parquetPath,
							assetName: v.assetName,
							filters: [{ path: column.split('.'), value }],
							back: v,
						})
					}
				/>
			)
			break
		}
		case 'assets': {
			const v = view
			body = (
				<AssetsList
					url={url}
					auth={auth}
					onSelect={(asset) => setView({ kind: 'asset', assetPath: asset.assetKey.path, back: v })}
					onBack={() => setView({ kind: 'menu' })}
					onLaunched={(runId) => setView({ kind: 'launched-run', runId })}
				/>
			)
			break
		}
		case 'runs':
			body = (
				<RunsList
					url={url}
					auth={auth}
					onSelect={(run) => setView({ kind: 'run', run })}
					onQuit={() => setView({ kind: 'menu' })}
					onDiff={(runId1, runId2) =>
						setView({ kind: 'runs-diff', runId1, runId2 })
					}
				/>
			)
			break
		case 'runs-diff':
			body = (
				<RunsDiff
					url={url}
					auth={auth}
					runId1={view.runId1}
					runId2={view.runId2}
					onBack={() => setView({ kind: 'runs' })}
				/>
			)
			break
		case 'metadata':
			body = <MetadataDetail entry={view.entry} onBack={() => setView(view.back)} />
			break
		case 'check': {
			const v = view
			body = (
				<CheckDetail
					check={v.check}
					onBack={() => setView(v.back)}
					onMetadata={(entry) => setView({ kind: 'metadata', entry, back: v })}
				/>
			)
			break
		}
		default:
			body = <Menu onSelect={onMenu} />
	}

	return (
		<FullScreenBox flexDirection="column">
			<Box
				borderStyle="single"
				borderColor="cyan"
				borderTop={false}
				borderLeft={false}
				borderRight={false}
				paddingX={1}
				justifyContent="space-between"
			>
				<Text bold color="cyan">
					{t.app.title}
				</Text>
				<Text dimColor>{viewLabel(view)}</Text>
				<Text dimColor>{url}</Text>
			</Box>
			<Box flexGrow={1} flexDirection="column" paddingX={1} overflow="hidden">
				{body}
			</Box>
			<Box
				borderStyle="single"
				borderColor="gray"
				borderBottom={false}
				borderLeft={false}
				borderRight={false}
				paddingX={1}
			>
				<Text dimColor>{viewKeymap(view)}</Text>
			</Box>
		</FullScreenBox>
	)
}

function LaunchedRunBridge({
	url,
	auth,
	runId,
	onOpen,
	onBack,
}: {
	url: string
	auth?: string
	runId: string
	onOpen: (run: Run) => void
	onBack: () => void
}) {
	const [error, setError] = useState<string | null>(null)
	useEffect(() => {
		const c = makeClient({ url, auth })
		fetchRun(c, runId)
			.then((r) =>
				onOpen({
					runId: r.runId,
					jobName: r.jobName,
					status: r.status,
					startTime: r.startTime,
					endTime: r.endTime,
				}),
			)
			.catch((e) => setError(String(e?.message ?? e)))
	}, [url, auth, runId, onOpen])

	if (error) {
		return (
			<Box flexDirection="column">
				<Text color="red">Failed to open run: {error}</Text>
				<Text dimColor>esc back</Text>
			</Box>
		)
	}
	return <Text dimColor>Opening {runId}...</Text>
	void onBack
}

interface RunDetailWrapperProps {
	url: string
	auth?: string
	run: Run
	onBack: () => void
	onTail: () => void
	onSelectStep: (step: RunStep) => void
}

function RunDetailWithHotkeys({
	url,
	auth,
	run,
	onBack,
	onTail,
	onSelectStep,
}: RunDetailWrapperProps) {
	useInput((input) => {
		if (input === 't') onTail()
	})
	return <RunDetail url={url} auth={auth} run={run} onBack={onBack} onSelectStep={onSelectStep} />
}
