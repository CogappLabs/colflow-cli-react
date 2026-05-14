import { Spinner, TextInput } from '@inkjs/ui'
import { Box, Text, useInput } from 'ink'
import { useEffect, useMemo, useState } from 'react'
import { fetchAssets, makeClient, type AssetListNode } from '../../client/index.ts'
import { timeAgo } from '../../format/index.ts'
import { useViewportWindow } from '../useViewport.ts'

interface Props {
	url: string
	auth?: string
	onSelect: (asset: AssetListNode) => void
	onBack: () => void
}

export function AssetsList({ url, auth, onSelect, onBack }: Props) {
	const [assets, setAssets] = useState<AssetListNode[] | null>(null)
	const [error, setError] = useState<string | null>(null)
	const [cursor, setCursor] = useState(0)
	const [filter, setFilter] = useState('')
	const [filterInput, setFilterInput] = useState(false)

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

	useInput((input, key) => {
		if (filterInput) return
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
		if (key.upArrow) setCursor((c) => Math.max(0, c - 1))
		if (key.downArrow) setCursor((c) => Math.min(filtered.length - 1, c + 1))
		if (key.pageUp) setCursor((c) => Math.max(0, c - visible))
		if (key.pageDown) setCursor((c) => Math.min(filtered.length - 1, c + visible))
		if (input === 'g') setCursor(0)
		if (input === 'G') setCursor(filtered.length - 1)
		if (key.return) {
			const a = filtered[cursor]
			if (a) onSelect(a)
		}
	})

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

	if (error && !assets) return <Text color="red">Error: {error}</Text>
	if (!assets) return <Spinner label="Loading assets..." />
	if (assets.length === 0) return <Text dimColor>No assets found.</Text>

	const maxName = Math.max(5, ...filtered.map((a) => a.assetKey.path.join('/').length))
	const nameWidth = Math.min(50, maxName)
	const maxGroup = Math.max(5, ...filtered.map((a) => (a.groupName ?? '-').length))
	const groupWidth = Math.min(20, maxGroup)
	const slice = filtered.slice(start, end)

	return (
		<Box flexDirection="column">
			{(filterInput || filter) && (
				<Box marginBottom={1}>
					{filterInput ? (
						<>
							<Text>/</Text>
							<TextInput
								defaultValue={filter}
								onSubmit={(v) => {
									setFilter(v.trim())
									setFilterInput(false)
									setCursor(0)
								}}
							/>
						</>
					) : (
						<Text>
							filter:{' '}
							<Text color="cyan" bold>
								{filter}
							</Text>{' '}
							({filtered.length}/{assets.length}) — c clear · / edit
						</Text>
					)}
				</Box>
			)}
			<Box>
				<Box width={2} />
				<Box width={nameWidth + 2}>
					<Text bold>ASSET</Text>
				</Box>
				<Box width={groupWidth + 2}>
					<Text bold>GROUP</Text>
				</Box>
				<Box width={20}>
					<Text bold>LAST MAT</Text>
				</Box>
				<Box flexGrow={1}>
					<Text bold>STALE</Text>
				</Box>
			</Box>
			{slice.map((a, sliceIdx) => {
				const i = start + sliceIdx
				const selected = i === cursor
				const lastMat = a.assetMaterializations[0]
				const stale = a.staleStatus
				const staleColour =
					stale === 'FRESH' ? 'green' : stale === 'STALE' ? 'yellow' : 'gray'
				return (
					<Box key={a.assetKey.path.join('/')}>
						<Box width={2}>
							<Text color="cyan">{selected ? '›' : ' '}</Text>
						</Box>
						<Box width={nameWidth + 2} flexShrink={0}>
							<Text color={selected ? 'cyan' : undefined} wrap="truncate">
								{a.assetKey.path.join('/')}
							</Text>
						</Box>
						<Box width={groupWidth + 2} flexShrink={0}>
							<Text wrap="truncate">{a.groupName ?? '-'}</Text>
						</Box>
						<Box width={20} flexShrink={0}>
							<Text>{lastMat ? timeAgo(lastMat.timestamp) : 'never'}</Text>
						</Box>
						<Box flexGrow={1}>
							<Text color={staleColour}>{stale}</Text>
						</Box>
					</Box>
				)
			})}
			{filtered.length > visible && (
				<Text dimColor>
					{cursor + 1}/{filtered.length} {start > 0 ? '↑' : ' '}
					{end < filtered.length ? '↓' : ' '}
				</Text>
			)}
		</Box>
	)
}
