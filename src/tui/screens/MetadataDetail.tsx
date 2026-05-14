import { useScreenSize } from 'fullscreen-ink'
import { Box, Text, useInput } from 'ink'
import { useState } from 'react'
import type { MetadataEntry } from '../../client/index.ts'
import { type Cell, type Column, Table } from '../components/Table.tsx'
import { useViewportWindow } from '../useViewport.ts'

interface Props {
	entry: MetadataEntry
	onBack: () => void
}

interface SchemaRow {
	name: string
	type: string
	nullable: 'yes' | 'no'
	constraints: string
}

interface TableRow {
	cells: string[]
}

interface LineRow {
	text: string
}

function buildSchema(entry: MetadataEntry): {
	columns: Column<SchemaRow>[]
	data: SchemaRow[]
} | null {
	const cols = entry.schema?.columns ?? []
	if (cols.length === 0) return null
	const data: SchemaRow[] = cols.map((c) => ({
		name: c.name,
		type: c.type,
		nullable: c.constraints.nullable ? 'yes' : 'no',
		constraints: [
			...(c.constraints.unique ? ['unique'] : []),
			...c.constraints.other,
		].join(', '),
	}))
	const columns: Column<SchemaRow>[] = [
		{ header: 'NAME', render: (r): Cell => ({ text: r.name }) },
		{
			header: 'TYPE',
			render: (r): Cell => ({ text: r.type, colour: 'cyan' }),
		},
		{
			header: 'NULLABLE',
			render: (r): Cell => ({
				text: r.nullable,
				colour: r.nullable === 'yes' ? 'yellow' : 'green',
			}),
		},
		{
			header: 'CONSTRAINTS',
			flex: true,
			render: (r): Cell => ({
				text: r.constraints,
				colour: r.constraints ? 'magenta' : undefined,
			}),
		},
	]
	return { columns, data }
}

function buildTable(entry: MetadataEntry): {
	columns: Column<TableRow>[]
	data: TableRow[]
} | null {
	const t = entry.table
	if (!t) return null
	const cols = t.schema.columns
	const records = t.records.map((r) => {
		try {
			return JSON.parse(r) as Record<string, unknown>
		} catch {
			return {}
		}
	})
	const data: TableRow[] = records.map((r) => ({
		cells: cols.map((c) => String(r[c.name] ?? '')),
	}))
	const columns: Column<TableRow>[] = cols.map((c, i) => ({
		header: c.name,
		flex: i === cols.length - 1,
		render: (row): Cell => ({ text: row.cells[i] ?? '' }),
	}))
	return { columns, data }
}

function buildLines(entry: MetadataEntry): { columns: Column<LineRow>[]; data: LineRow[] } {
	const text = (() => {
		switch (entry.__typename) {
			case 'TextMetadataEntry':
				return entry.text ?? ''
			case 'JsonMetadataEntry': {
				const s = entry.jsonString ?? ''
				try {
					return JSON.stringify(JSON.parse(s), null, 2)
				} catch {
					return s
				}
			}
			case 'MarkdownMetadataEntry':
				return entry.mdStr ?? ''
			default:
				return ''
		}
	})()
	const lines = text.split(/\r?\n/)
	const data: LineRow[] = lines.map((l) => ({ text: l || ' ' }))
	const columns: Column<LineRow>[] = [
		{ header: '', flex: true, render: (r): Cell => ({ text: r.text }) },
	]
	return { columns, data }
}

export function MetadataDetail({ entry, onBack }: Props) {
	const { height } = useScreenSize()
	const [scroll, setScroll] = useState(0)

	const isStructured =
		entry.__typename === 'TableSchemaMetadataEntry' ||
		entry.__typename === 'TableMetadataEntry'

	const built: { columns: Column<unknown>[]; data: unknown[] } = (() => {
		if (entry.__typename === 'TableSchemaMetadataEntry') {
			const b = buildSchema(entry)
			if (b) return { columns: b.columns as Column<unknown>[], data: b.data }
		}
		if (entry.__typename === 'TableMetadataEntry') {
			const b = buildTable(entry)
			if (b) return { columns: b.columns as Column<unknown>[], data: b.data }
		}
		const b = buildLines(entry)
		return { columns: b.columns as Column<unknown>[], data: b.data }
	})()

	// Reserve: shell(4) + title(1) + header(1) + margins(3)
	const { start, end, visible } = useViewportWindow(built.data.length, scroll, 9)
	const slice = built.data.slice(start, end)

	useInput((input, key) => {
		if (input === 'q' || key.escape || key.leftArrow) {
			onBack()
			return
		}
		if (built.data.length === 0) return
		if (key.upArrow) setScroll((s) => Math.max(0, s - 1))
		if (key.downArrow) setScroll((s) => Math.min(built.data.length - 1, s + 1))
		if (key.pageUp) setScroll((s) => Math.max(0, s - visible))
		if (key.pageDown) setScroll((s) => Math.min(built.data.length - 1, s + visible))
		if (input === 'g') setScroll(0)
		if (input === 'G') setScroll(built.data.length - 1)
	})

	void height

	return (
		<Box flexDirection="column">
			<Box>
				<Text bold>{entry.label}</Text>
				<Box flexGrow={1} />
				<Text dimColor>
					{built.data.length === 0
						? '(empty)'
						: built.data.length > visible
							? `${start + 1}-${start + slice.length}/${built.data.length}`
							: `${built.data.length} ${isStructured ? 'rows' : 'lines'}`}
				</Text>
			</Box>
			<Box marginTop={1}>
				<Table columns={built.columns} data={slice} />
			</Box>
		</Box>
	)
}
