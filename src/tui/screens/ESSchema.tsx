import { Spinner } from '@inkjs/ui'
import { Box, Text, useInput } from 'ink'
import { useEffect, useState } from 'react'
import { fetchMapping, type MappingField, resolveKey, resolveUrl } from '../../es/index.ts'
import { type Column, Table } from '../components/Table.tsx'
import { t } from '../i18n/en.ts'
import { useViewportWindow } from '../useViewport.ts'

interface Props {
	index: string
	onBack: () => void
}

function typeColour(t: string): string | undefined {
	if (t === 'keyword' || t === 'text') return 'cyan'
	if (t === 'date') return 'yellow'
	if (t.startsWith('int') || t === 'long' || t === 'float' || t === 'double') return 'green'
	if (t === 'boolean') return 'magenta'
	return undefined
}

export function ESSchema({ index, onBack }: Props) {
	const [fields, setFields] = useState<MappingField[] | null>(null)
	const [error, setError] = useState<string | null>(null)
	const [cursor, setCursor] = useState(0)
	const base = resolveUrl(undefined)
	const key = resolveKey(undefined)

	useEffect(() => {
		let cancelled = false
		fetchMapping(base, index, key, false)
			.then((f) => {
				if (!cancelled) setFields(f)
			})
			.catch((e) => !cancelled && setError(String(e?.message ?? e)))
		return () => {
			cancelled = true
		}
	}, [base, key, index])

	const safeFields = fields ?? []
	const { start, end, visible } = useViewportWindow(safeFields.length, cursor, 8)

	useInput((input, key2) => {
		if (input === 'q' || key2.escape || key2.leftArrow) {
			onBack()
			return
		}
		if (safeFields.length === 0) return
		if (key2.upArrow) setCursor((c) => (c <= 0 ? safeFields.length - 1 : c - 1))
		if (key2.downArrow) setCursor((c) => (c >= safeFields.length - 1 ? 0 : c + 1))
		if (key2.pageUp) setCursor((c) => Math.max(0, c - visible))
		if (key2.pageDown) setCursor((c) => Math.min(safeFields.length - 1, c + visible))
		if (input === 'g') setCursor(0)
		if (input === 'G') setCursor(safeFields.length - 1)
	})

	if (error) return <Text color="red">{error}</Text>
	if (!fields) return <Spinner label={t.esSchema.loading} />
	if (fields.length === 0) return <Text dimColor>{t.esSchema.empty}</Text>

	const columns: Column<MappingField>[] = [
		{ header: t.esSchema.header.field, flex: true, render: (f) => ({ text: f.path.join('.') }) },
		{
			header: t.esSchema.header.type,
			width: 14,
			render: (f) => ({ text: f.type, colour: typeColour(f.type) }),
		},
	]

	return (
		<Box flexDirection="column">
			<Text bold color="cyan">
				{t.esSchema.title(index, fields.length)}
			</Text>
			<Box marginTop={1}>
				<Table
					columns={columns}
					data={fields}
					cursor={cursor}
					viewport={{ start, end, visible, total: fields.length }}
				/>
			</Box>
		</Box>
	)
}
