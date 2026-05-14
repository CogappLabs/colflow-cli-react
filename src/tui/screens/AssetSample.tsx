import { Spinner } from '@inkjs/ui'
import { Box, Text, useInput } from 'ink'
import { useEffect, useState } from 'react'
import { sampleRows } from '../../parquet/index.ts'
import { t } from '../i18n/en.ts'

interface Props {
	parquetPath: string
	assetName: string
	filters?: { path: string[]; value: string }[]
	limit?: number
	onBack: () => void
	onDetails: (title: string, body: string) => void
}

function formatValue(v: unknown): string {
	if (v == null) return 'null'
	if (typeof v === 'string') return v.length > 80 ? `${v.slice(0, 80)}…` : v
	if (typeof v === 'bigint') return v.toString()
	if (v instanceof Uint8Array) return Buffer.from(v).toString('utf-8').slice(0, 80)
	if (typeof v === 'object') {
		const j = JSON.stringify(v)
		return j.length > 80 ? `${j.slice(0, 80)}…` : j
	}
	return String(v)
}

function rawValue(v: unknown): string {
	if (v == null) return 'null'
	if (typeof v === 'string') return v
	if (typeof v === 'bigint') return v.toString()
	if (v instanceof Uint8Array) return Buffer.from(v).toString('utf-8')
	if (typeof v === 'object') return JSON.stringify(v, null, 2)
	return String(v)
}

export function AssetSample({
	parquetPath,
	assetName,
	filters = [],
	limit = 10,
	onBack,
	onDetails,
}: Props) {
	const [rows, setRows] = useState<Record<string, unknown>[] | null>(null)
	const [error, setError] = useState<string | null>(null)
	const [cursor, setCursor] = useState(0)

	useEffect(() => {
		sampleRows(parquetPath, limit, filters, 100_000)
			.then(setRows)
			.catch((e) => setError(String(e?.message ?? e)))
	}, [parquetPath, limit, filters])

	useInput((input, key) => {
		if (input === 'q' || key.escape || key.leftArrow) {
			onBack()
			return
		}
		if (!rows || rows.length === 0) return
		if (key.upArrow) setCursor((c) => (c <= 0 ? rows.length - 1 : c - 1))
		if (key.downArrow) setCursor((c) => (c >= rows.length - 1 ? 0 : c + 1))
		if (key.return) {
			const r = rows[cursor]
			if (r) {
				const entries = Object.entries(r)
				const maxKey = Math.max(...entries.map(([k]) => k.length))
				const body: string[] = []
				for (const [k, v] of entries) {
					const raw = rawValue(v)
					const lines = raw.split('\n')
					const first = lines[0] ?? ''
					body.push(`${k.padEnd(maxKey)}  ${first}`)
					const indent = ' '.repeat(maxKey + 2)
					for (let i = 1; i < lines.length; i++) {
						body.push(`${indent}${lines[i]}`)
					}
				}
				const id = (r.id ?? r.ID ?? r.ObjectID ?? cursor + 1) as string | number
				onDetails(`Row ${id}`, body.join('\n'))
			}
		}
	})

	if (error)
		return (
			<Text color="red">
				{t.common.errorPrefix} {error}
			</Text>
		)
	if (!rows) return <Spinner label={t.assetSampleById.loading} />
	if (rows.length === 0) {
		return (
			<Box flexDirection="column">
				<Text bold color="cyan">
					{assetName}
				</Text>
				<Text dimColor>
					{filters.length > 0
						? t.assetSample.emptyFiltered(
								filters.map((f) => `${f.path.join('.')}=${f.value}`).join(', '),
							)
						: t.assetSample.empty}
				</Text>
			</Box>
		)
	}

	const row = rows[cursor]!
	const keys = Object.keys(row)
	const maxKey = Math.max(...keys.map((k) => k.length))

	return (
		<Box flexDirection="column">
			<Text bold color="cyan">
				{assetName}
			</Text>
			<Box marginTop={1}>
				<Text>
					{t.assetSample.rowCounter(cursor + 1, rows.length)}
					{filters.length > 0 && (
						<Text dimColor>
							{'   '}
							{t.assetSample.filterLabel}{' '}
							{filters.map((f) => `${f.path.join('.')}=${f.value}`).join(', ')}
						</Text>
					)}
				</Text>
			</Box>
			<Box marginTop={1} flexDirection="column">
				{keys.map((k) => (
					<Box key={k}>
						<Box width={maxKey + 2} flexShrink={0}>
							<Text color="cyan" wrap="truncate">
								{k}
							</Text>
						</Box>
						<Box flexGrow={1}>
							<Text wrap="truncate">{formatValue(row[k])}</Text>
						</Box>
					</Box>
				))}
			</Box>
			<Box marginTop={1}>
				<Text dimColor>{t.assetSample.fullRowFooter}</Text>
			</Box>
		</Box>
	)
}
