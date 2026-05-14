import { Spinner } from '@inkjs/ui'
import { Box, Text, useInput } from 'ink'
import { useEffect, useState } from 'react'
import { inspectParquet, type ParquetInfo } from '../../parquet/index.ts'
import { type Column, Table } from '../components/Table.tsx'
import { t } from '../i18n/en.ts'
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

type ParquetColumn = ParquetInfo['columns'][number]

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
		if (key.upArrow) setCursor((c) => (c <= 0 ? cols.length - 1 : c - 1))
		if (key.downArrow) setCursor((c) => (c >= cols.length - 1 ? 0 : c + 1))
		if (key.pageUp) setCursor((c) => Math.max(0, c - visible))
		if (key.pageDown) setCursor((c) => Math.min(cols.length - 1, c + visible))
		if (input === 'g') setCursor(0)
		if (input === 'G') setCursor(cols.length - 1)
	})

	if (error)
		return (
			<Text color="red">
				{t.common.errorPrefix} {error}
			</Text>
		)
	if (!info) return <Spinner label={t.assetSampleById.loading} />

	const maxName = Math.max(4, ...cols.map((c) => c.name.length))

	const columns: Column<ParquetColumn>[] = [
		{
			header: t.assetSchema.header.name,
			width: maxName,
			render: (c) => ({ text: c.name }),
		},
		{
			header: t.assetSchema.header.populated,
			width: 12,
			render: (c) => ({ text: c.populated.toLocaleString(), dim: true }),
		},
		{
			header: t.assetSchema.header.percent,
			flex: true,
			render: (c) => {
				const colour = c.populatedPct === 100 ? 'green' : c.populatedPct >= 50 ? 'yellow' : 'red'
				return { text: `${c.populatedPct.toFixed(1)}%`, colour }
			},
		},
	]

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

			<Box marginTop={1}>
				<Table
					columns={columns}
					data={cols}
					cursor={cursor}
					viewport={{ start, end, visible, total: cols.length }}
				/>
			</Box>
		</Box>
	)
}
