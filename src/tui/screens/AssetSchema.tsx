import { Spinner } from '@inkjs/ui'
import { Box, Text, useInput } from 'ink'
import { useEffect, useState } from 'react'
import { inspectParquet, type ParquetInfo } from '../../parquet/index.ts'
import { useViewportWindow } from '../useViewport.ts'

interface Props {
	parquetPath: string
	assetName: string
	onBack: () => void
}

function humanBytes(n: number): string {
	const units = ['B', 'KiB', 'MiB', 'GiB', 'TiB']
	let i = 0
	let v = n
	while (v >= 1024 && i < units.length - 1) {
		v /= 1024
		i++
	}
	return i === 0 ? `${n} B` : `${v.toFixed(1)} ${units[i]}`
}

export function AssetSchema({ parquetPath, assetName, onBack }: Props) {
	const [info, setInfo] = useState<ParquetInfo | null>(null)
	const [error, setError] = useState<string | null>(null)
	const [cursor, setCursor] = useState(0)

	const cols = info?.columns ?? []
	const { start, end, visible } = useViewportWindow(cols.length, cursor, 10)

	useEffect(() => {
		inspectParquet(parquetPath)
			.then(setInfo)
			.catch((e) => setError(String(e?.message ?? e)))
	}, [parquetPath])

	useInput((input, key) => {
		if (input === 'q' || key.escape || key.leftArrow) {
			onBack()
			return
		}
		if (cols.length === 0) return
		if (key.upArrow) setCursor((c) => Math.max(0, c - 1))
		if (key.downArrow) setCursor((c) => Math.min(cols.length - 1, c + 1))
		if (key.pageUp) setCursor((c) => Math.max(0, c - visible))
		if (key.pageDown) setCursor((c) => Math.min(cols.length - 1, c + visible))
		if (input === 'g') setCursor(0)
		if (input === 'G') setCursor(cols.length - 1)
	})

	if (error) return <Text color="red">Error: {error}</Text>
	if (!info) return <Spinner label="Reading parquet..." />

	const slice = cols.slice(start, end)
	const maxName = Math.max(4, ...cols.map((c) => c.name.length))

	return (
		<Box flexDirection="column">
			<Text bold color="cyan">
				{assetName}
			</Text>
			<Box marginTop={1} flexDirection="column">
				<Text>
					Rows: <Text color="cyan">{info.rows.toLocaleString()}</Text>
					{'   '}Size: <Text color="cyan">{humanBytes(info.sizeBytes)}</Text>
					{'   '}Row groups: {info.rowGroups}
					{'   '}Columns: {cols.length}
				</Text>
			</Box>

			<Box marginTop={1} flexDirection="column">
				<Box>
					<Box width={2} />
					<Box width={maxName + 2} flexShrink={0}>
						<Text bold>NAME</Text>
					</Box>
					<Box width={14} flexShrink={0}>
						<Text bold>POPULATED</Text>
					</Box>
					<Box flexGrow={1}>
						<Text bold>%</Text>
					</Box>
				</Box>
				{slice.map((c, sliceIdx) => {
					const i = start + sliceIdx
					const selected = i === cursor
					const colour =
						c.populatedPct === 100 ? 'green' : c.populatedPct >= 50 ? 'yellow' : 'red'
					return (
						<Box key={c.name}>
							<Box width={2} flexShrink={0}>
								<Text color="cyan">{selected ? '›' : ' '}</Text>
							</Box>
							<Box width={maxName + 2} flexShrink={0}>
								<Text color={selected ? 'cyan' : undefined} wrap="truncate">
									{c.name}
								</Text>
							</Box>
							<Box width={14} flexShrink={0}>
								<Text dimColor>{c.populated.toLocaleString()}</Text>
							</Box>
							<Box flexGrow={1}>
								<Text color={colour}>{c.populatedPct.toFixed(1)}%</Text>
							</Box>
						</Box>
					)
				})}
				{cols.length > visible && (
					<Text dimColor>
						{cursor + 1}/{cols.length} {start > 0 ? '↑' : ' '}
						{end < cols.length ? '↓' : ' '}
					</Text>
				)}
			</Box>
		</Box>
	)
}
