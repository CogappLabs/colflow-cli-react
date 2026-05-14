import { Spinner, TextInput } from '@inkjs/ui'
import { Box, Text, useInput } from 'ink'
import { useEffect, useMemo, useState } from 'react'
import { type AssetListNode, fetchAssets, launchAssetRun, makeClient } from '../../client/index.ts'
import { timeAgo } from '../../format/index.ts'
import { type Column, Table } from '../components/Table.tsx'
import { t } from '../i18n/en.ts'
import { useViewportWindow } from '../useViewport.ts'

interface Props {
	url: string
	auth?: string
	onSelect: (asset: AssetListNode) => void
	onBack: () => void
	onLaunched: (runId: string) => void
}

type LaunchPhase =
	| { kind: 'idle' }
	| { kind: 'confirm'; assets: string[] }
	| { kind: 'launching' }
	| { kind: 'error'; message: string }

export function AssetsList({ url, auth, onSelect, onBack, onLaunched }: Props) {
	const [assets, setAssets] = useState<AssetListNode[] | null>(null)
	const [error, setError] = useState<string | null>(null)
	const [cursor, setCursor] = useState(0)
	const [filter, setFilter] = useState('')
	const [filterInput, setFilterInput] = useState(false)
	const [selected, setSelected] = useState<Set<string>>(new Set())
	const [phase, setPhase] = useState<LaunchPhase>({ kind: 'idle' })

	useEffect(() => {
		const client = makeClient({ url, auth })
		let cancelled = false
		let timer: ReturnType<typeof setTimeout> | null = null
		const tick = async () => {
			try {
				const a = await fetchAssets(client)
				if (cancelled) return
				const sorted = a.slice().sort((x, y) => {
					const gx = x.groupName ?? ''
					const gy = y.groupName ?? ''
					if (gx !== gy) return gx.localeCompare(gy)
					return x.assetKey.path.join('/').localeCompare(y.assetKey.path.join('/'))
				})
				setAssets(sorted)
				setError(null)
			} catch (e) {
				if (cancelled) return
				setError(String((e as Error)?.message ?? e))
			}
			timer = setTimeout(tick, 10_000)
		}
		tick()
		return () => {
			cancelled = true
			if (timer) clearTimeout(timer)
		}
	}, [url, auth])

	const filtered = useMemo(() => {
		if (!assets) return []
		if (!filter) return assets
		const f = filter.toLowerCase()
		return assets.filter((a) => {
			const key = a.assetKey.path.join('/').toLowerCase()
			const group = (a.groupName ?? '').toLowerCase()
			return key.includes(f) || group.includes(f)
		})
	}, [assets, filter])

	const { start, end, visible } = useViewportWindow(filtered.length, cursor, 9)

	useInput((input, key) => {
		if (filterInput) return
		if (phase.kind === 'launching') return
		if (phase.kind === 'confirm') {
			if (input === 'y' || key.return) {
				const names = phase.assets
				setPhase({ kind: 'launching' })
				const client = makeClient({ url, auth })
				launchAssetRun(client, names)
					.then((runId) => {
						setSelected(new Set())
						setPhase({ kind: 'idle' })
						onLaunched(runId)
					})
					.catch((e: Error) => setPhase({ kind: 'error', message: String(e?.message ?? e) }))
				return
			}
			if (input === 'n' || key.escape) setPhase({ kind: 'idle' })
			return
		}
		if (phase.kind === 'error' && key.return) {
			setPhase({ kind: 'idle' })
			return
		}
		if (input === 'q' || key.escape || key.leftArrow) {
			onBack()
			return
		}
		if (input === '/') {
			setFilterInput(true)
			return
		}
		if (input === 'c' && filter) {
			setFilter('')
			setCursor(0)
			return
		}
		if (filtered.length === 0) return
		if (key.upArrow) setCursor((c) => (c <= 0 ? filtered.length - 1 : c - 1))
		if (key.downArrow) setCursor((c) => (c >= filtered.length - 1 ? 0 : c + 1))
		if (key.pageUp) setCursor((c) => Math.max(0, c - visible))
		if (key.pageDown) setCursor((c) => Math.min(filtered.length - 1, c + visible))
		if (input === 'g') setCursor(0)
		if (input === 'G') setCursor(filtered.length - 1)
		if (input === ' ') {
			const a = filtered[cursor]
			if (!a) return
			const k = a.assetKey.path.join('/')
			setSelected((s) => {
				const next = new Set(s)
				if (next.has(k)) next.delete(k)
				else next.add(k)
				return next
			})
			return
		}
		if (input === 'a') {
			setSelected(new Set(filtered.map((a) => a.assetKey.path.join('/'))))
			return
		}
		if (input === 'A') {
			setSelected(new Set())
			return
		}
		if (input === 'm') {
			const lastSegment = (a: AssetListNode) => a.assetKey.path[a.assetKey.path.length - 1] ?? ''
			const names: string[] =
				selected.size > 0
					? (assets ?? []).filter((a) => selected.has(a.assetKey.path.join('/'))).map(lastSegment)
					: filtered[cursor]
						? [lastSegment(filtered[cursor])]
						: []
			if (names.length === 0) return
			setPhase({ kind: 'confirm', assets: names })
			return
		}
		if (key.return) {
			const a = filtered[cursor]
			if (a) onSelect(a)
		}
	})

	if (error && !assets)
		return (
			<Text color="red">
				{t.common.errorPrefix} {error}
			</Text>
		)
	if (!assets) return <Spinner label={t.common.loading} />
	if (assets.length === 0) return <Text dimColor>{t.assets.empty}</Text>

	const maxName = Math.max(5, ...filtered.map((a) => a.assetKey.path.join('/').length))
	const nameWidth = Math.min(50, maxName)
	const maxGroup = Math.max(5, ...filtered.map((a) => (a.groupName ?? '-').length))
	const groupWidth = Math.min(20, maxGroup)

	// Convert string-keyed selection to index-based Set for Table
	const selectedIndices = new Set(
		filtered
			.map((a, i) => (selected.has(a.assetKey.path.join('/')) ? i : -1))
			.filter((i) => i >= 0),
	)

	const columns: Column<AssetListNode>[] = [
		{
			header: t.assets.header.asset,
			width: nameWidth,
			render: (a) => ({ text: a.assetKey.path.join('/') }),
		},
		{
			header: t.assets.header.group,
			width: groupWidth,
			render: (a) => ({ text: a.groupName ?? '-' }),
		},
		{
			header: t.assets.header.lastMat,
			width: 18,
			render: (a) => ({
				text: a.assetMaterializations[0]
					? timeAgo(a.assetMaterializations[0].timestamp)
					: t.assets.never,
			}),
		},
		{
			header: t.assets.header.stale,
			width: 8,
			render: (a) => {
				const stale = a.staleStatus
				const colour = stale === 'FRESH' ? 'green' : stale === 'STALE' ? 'yellow' : 'gray'
				return { text: stale, colour }
			},
		},
		{
			header: t.assets.header.checks,
			flex: true,
			render: (a) => ({
				text: a.hasAssetChecks ? '✓' : '',
				colour: a.hasAssetChecks ? 'green' : undefined,
			}),
		},
	]

	return (
		<Box flexDirection="column">
			{phase.kind === 'confirm' && (
				<Box marginBottom={1} flexDirection="column">
					<Text color="yellow">
						{t.assets.materialiseConfirm(phase.assets.length, phase.assets.join(', '))}
					</Text>
					<Text>
						<Text color="green">y</Text> confirm · <Text color="red">n</Text> cancel
					</Text>
				</Box>
			)}
			{phase.kind === 'launching' && (
				<Box marginBottom={1}>
					<Spinner label={t.asset.launching} />
				</Box>
			)}
			{phase.kind === 'error' && (
				<Box marginBottom={1} flexDirection="column">
					<Text color="red">{t.asset.launchFailed(phase.message)}</Text>
					<Text dimColor>{t.common.dismissHint}</Text>
				</Box>
			)}
			{selected.size > 0 && (
				<Box marginBottom={1}>
					<Text>
						<Text bold>{t.assets.selectedLabel}</Text> {selected.size} · <Text color="cyan">m</Text>{' '}
						materialise · <Text color="cyan">A</Text> clear
					</Text>
				</Box>
			)}
			{(filterInput || filter) && (
				<Box marginBottom={1}>
					{filterInput ? (
						<>
							<Text>/</Text>
							<TextInput
								defaultValue={filter}
								onChange={(v) => {
									setFilter(v)
									setCursor(0)
								}}
								onSubmit={() => setFilterInput(false)}
							/>
						</>
					) : (
						<Text>
							filter:{' '}
							<Text color="cyan" bold>
								{filter}
							</Text>{' '}
							({filtered.length}/{assets.length}) — {t.assets.filterEdit}
						</Text>
					)}
				</Box>
			)}
			<Table
				columns={columns}
				data={filtered}
				cursor={cursor}
				selected={selectedIndices}
				viewport={{ start, end, visible, total: filtered.length }}
			/>
		</Box>
	)
}
