import { Spinner } from '@inkjs/ui'
import { Box, Text, useInput } from 'ink'
import { useEffect, useState } from 'react'
import {
	fetchJobAssets,
	type Job,
	type JobAssetNode,
	launchRun,
	makeClient,
} from '../../client/index.ts'
import { t } from '../i18n/en.ts'
import { useViewportWindow } from '../useViewport.ts'

interface Props {
	url: string
	auth?: string
	job: Job
	onBack: () => void
	onLaunched: (runId: string) => void
	onSelectAsset: (assetPath: string[]) => void
}

type Phase =
	| { kind: 'idle' }
	| { kind: 'confirm' }
	| { kind: 'launching' }
	| { kind: 'launched'; runId: string }
	| { kind: 'error'; message: string }

interface AssetLine {
	depth: number
	key: string
	group: string
	upstream: string[]
}

/**
 * Layered topological layout: depth = longest path from any root.
 * Each asset appears exactly once at its true layer, sorted by (depth, group, name).
 */
function buildAssetTree(nodes: JobAssetNode[]): AssetLine[] {
	const inJob = new Set(nodes.map((n) => n.assetKey.path.join('/')))
	const byKey = new Map<string, JobAssetNode>()
	for (const n of nodes) byKey.set(n.assetKey.path.join('/'), n)

	// depth(node) = 1 + max(depth(in-job upstream)). Memoised, cycle-safe.
	const depthCache = new Map<string, number>()
	const computing = new Set<string>()
	const depthOf = (key: string): number => {
		if (depthCache.has(key)) return depthCache.get(key)!
		if (computing.has(key)) return 0
		computing.add(key)
		const node = byKey.get(key)
		const upstream = (node?.dependencyKeys ?? [])
			.map((d) => d.path.join('/'))
			.filter((u) => inJob.has(u))
		const d = upstream.length === 0 ? 0 : 1 + Math.max(...upstream.map(depthOf))
		computing.delete(key)
		depthCache.set(key, d)
		return d
	}

	const lines: AssetLine[] = nodes.map((n) => {
		const key = n.assetKey.path.join('/')
		return {
			depth: depthOf(key),
			key,
			group: n.groupName ?? '-',
			upstream: n.dependencyKeys
				.map((d) => d.path.join('/'))
				.filter((u) => inJob.has(u))
				.sort(),
		}
	})

	lines.sort((a, b) => {
		if (a.depth !== b.depth) return a.depth - b.depth
		if (a.group !== b.group) return a.group.localeCompare(b.group)
		return a.key.localeCompare(b.key)
	})
	return lines
}

export function JobDetail({ url, auth, job, onBack, onLaunched, onSelectAsset }: Props) {
	const [phase, setPhase] = useState<Phase>({ kind: 'idle' })
	const [assets, setAssets] = useState<JobAssetNode[] | null>(null)
	const [assetsErr, setAssetsErr] = useState<string | null>(null)
	const [cursor, setCursor] = useState(0)
	const internal = job.name.startsWith('__')

	useEffect(() => {
		const client = makeClient({ url, auth })
		fetchJobAssets(client, job.name)
			.then(setAssets)
			.catch((e) => setAssetsErr(String(e?.message ?? e)))
	}, [url, auth, job.name])

	const tree = assets ? buildAssetTree(assets) : []
	const { start, end, visible } = useViewportWindow(tree.length, cursor, 14)
	const slice = tree.slice(start, end)

	useInput((input, key) => {
		if (phase.kind === 'launching') return
		if (input === 'q' || key.escape || key.leftArrow) {
			if (phase.kind === 'confirm') {
				setPhase({ kind: 'idle' })
			} else {
				onBack()
			}
			return
		}
		if (phase.kind === 'idle' && input === 'l' && !internal) {
			setPhase({ kind: 'confirm' })
			return
		}
		if (phase.kind === 'confirm') {
			if (input === 'y' || key.return) {
				setPhase({ kind: 'launching' })
				const client = makeClient({ url, auth })
				launchRun(client, job.name)
					.then((runId) => {
						setPhase({ kind: 'launched', runId })
					})
					.catch((e: Error) => {
						setPhase({ kind: 'error', message: String(e?.message ?? e) })
					})
			}
			if (input === 'n') setPhase({ kind: 'idle' })
			return
		}
		if (phase.kind === 'launched' && key.return) {
			onLaunched(phase.runId)
			return
		}
		if (phase.kind === 'error' && key.return) {
			setPhase({ kind: 'idle' })
			return
		}
		// Idle: navigate the asset tree
		if (tree.length === 0) return
		if (key.upArrow) setCursor((c) => (c <= 0 ? tree.length - 1 : c - 1))
		if (key.downArrow) setCursor((c) => (c >= tree.length - 1 ? 0 : c + 1))
		if (key.pageUp) setCursor((c) => Math.max(0, c - visible))
		if (key.pageDown) setCursor((c) => Math.min(tree.length - 1, c + visible))
		if (input === 'g') setCursor(0)
		if (input === 'G') setCursor(tree.length - 1)
		if (key.return) {
			const line = tree[cursor]
			if (line) onSelectAsset(line.key.split('/'))
		}
	})

	return (
		<Box flexDirection="column">
			<Text bold color="cyan">
				{job.name}
			</Text>
			{internal && (
				<Box marginTop={1}>
					<Text dimColor>{t.job.internal}</Text>
				</Box>
			)}

			{job.description && (
				<Box marginTop={1} flexDirection="column">
					<Text bold>{t.job.descriptionHeader}</Text>
					<Text dimColor>{job.description}</Text>
				</Box>
			)}

			<Box marginTop={1} flexDirection="column">
				<Text bold>{t.job.assetsHeader(assets?.length ?? '...')}</Text>
				{assetsErr ? (
					<Text color="red">{assetsErr}</Text>
				) : !assets ? (
					<Spinner label={t.job.assetsLoading} />
				) : tree.length === 0 ? (
					<Text dimColor>{t.job.assetsEmpty}</Text>
				) : (
					<>
						{slice.map((line, sliceIdx) => {
							const i = start + sliceIdx
							const selected = i === cursor
							const indent = '  '.repeat(line.depth)
							return (
								<Box key={`${i}-${line.key}`}>
									<Box width={2} flexShrink={0}>
										<Text color="cyan">{selected ? '›' : ' '}</Text>
									</Box>
									<Box width={4} flexShrink={0}>
										<Text dimColor>L{line.depth}</Text>
									</Box>
									<Box flexGrow={1}>
										<Text color={selected ? 'cyan' : undefined} wrap="truncate">
											{indent}
											{line.key}
										</Text>
									</Box>
									<Box width={16} flexShrink={0}>
										<Text dimColor>{line.group}</Text>
									</Box>
								</Box>
							)
						})}
						{tree.length > visible && (
							<Text dimColor>
								{cursor + 1}/{tree.length} {start > 0 ? '↑' : ' '}
								{end < tree.length ? '↓' : ' '}
							</Text>
						)}
					</>
				)}
			</Box>

			<Box marginTop={1} flexDirection="column">
				{phase.kind === 'idle' && !internal && <Text>{t.job.launchPrompt('l')}</Text>}
				{phase.kind === 'confirm' && (
					<Box flexDirection="column">
						<Text color="yellow">{t.job.launchConfirm(job.name)}</Text>
						<Text>
							<Text color="green">y</Text> confirm · <Text color="red">n</Text> cancel
						</Text>
					</Box>
				)}
				{phase.kind === 'launching' && <Text color="cyan">{t.job.launching}</Text>}
				{phase.kind === 'launched' && (
					<Box flexDirection="column">
						<Text color="green">{t.job.launched(phase.runId)}</Text>
						<Text dimColor>{t.job.launchedHint}</Text>
					</Box>
				)}
				{phase.kind === 'error' && (
					<Box flexDirection="column">
						<Text color="red">{t.job.launchFailed}</Text>
						<Text>{phase.message}</Text>
						<Text dimColor>{t.job.launchDismissHint}</Text>
					</Box>
				)}
			</Box>
		</Box>
	)
}
