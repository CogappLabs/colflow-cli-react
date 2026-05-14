import { Box, Text, useInput } from 'ink'
import type { AssetCheckEval, MetadataEntry } from '../../client/index.ts'
import { t } from '../i18n/en.ts'

interface Props {
	check: AssetCheckEval
	onBack: () => void
	onMetadata: (entry: MetadataEntry) => void
}

function renderInline(e: MetadataEntry, max = 200): string {
	switch (e.__typename) {
		case 'IntMetadataEntry':
			return String(e.intValue)
		case 'FloatMetadataEntry':
			return String(e.floatValue)
		case 'BoolMetadataEntry':
			return String(e.boolValue)
		case 'TextMetadataEntry': {
			const s = e.text ?? ''
			return s.length > max ? `${s.slice(0, max)}…` : s
		}
		case 'PathMetadataEntry':
			return e.path ?? ''
		case 'UrlMetadataEntry':
			return e.url ?? ''
		case 'JsonMetadataEntry': {
			const s = e.jsonString ?? ''
			return s.length > max ? `${s.slice(0, max)}…` : s
		}
		case 'MarkdownMetadataEntry': {
			const s = (e.mdStr ?? '').replace(/\s+/g, ' ').trim()
			return s.length > max ? `${s.slice(0, max)}…` : s
		}
		case 'TableSchemaMetadataEntry':
			return e.schema ? `${e.schema.columns.length} columns` : '(table schema)'
		case 'TableMetadataEntry':
			return e.table
				? `${e.table.records.length} rows × ${e.table.schema.columns.length} cols`
				: '(table)'
		default:
			return `(${e.__typename.replace(/MetadataEntry$/, '').toLowerCase()})`
	}
}

function isOpenable(e: MetadataEntry): boolean {
	return (
		(e.__typename === 'TextMetadataEntry' && (e.text?.length ?? 0) > 80) ||
		(e.__typename === 'JsonMetadataEntry' && (e.jsonString?.length ?? 0) > 80) ||
		(e.__typename === 'MarkdownMetadataEntry' && (e.mdStr?.length ?? 0) > 80) ||
		(e.__typename === 'TableSchemaMetadataEntry' && (e.schema?.columns.length ?? 0) > 0) ||
		(e.__typename === 'TableMetadataEntry' && (e.table?.records.length ?? 0) > 0)
	)
}

export function CheckDetail({ check, onBack, onMetadata }: Props) {
	const openable = check.metadataEntries
		.map((e, i) => (isOpenable(e) ? i : -1))
		.filter((i) => i >= 0)
	const firstOpenable = openable[0] ?? null

	useInput((input, key) => {
		if (input === 'q' || key.escape || key.leftArrow) {
			onBack()
			return
		}
		// Single-key shortcut: ↵ on first openable entry.
		if (key.return && firstOpenable !== null) {
			const e = check.metadataEntries[firstOpenable]
			if (e) onMetadata(e)
		}
	})

	const maxLabel = Math.max(8, ...check.metadataEntries.map((e) => e.label.length))

	return (
		<Box flexDirection="column">
			<Box>
				<Box width={6} flexShrink={0}>
					<Text color={check.success ? 'green' : 'red'} bold>
						{check.success ? 'PASS' : 'FAIL'}
					</Text>
				</Box>
				<Box flexGrow={1}>
					<Text bold>{check.checkName}</Text>
				</Box>
				<Text>severity: {check.severity}</Text>
			</Box>

			<Box marginTop={1} flexDirection="column">
				{check.metadataEntries.length === 0 ? (
					<Text dimColor>{t.checkDetail.noMetadata}</Text>
				) : (
					check.metadataEntries.map((e, i) => {
						const open = isOpenable(e)
						return (
							<Box key={`${e.label}-${e.__typename}`}>
								<Box width={maxLabel + 2} flexShrink={0}>
									<Text bold color="cyan">
										{e.label}
									</Text>
								</Box>
								<Box flexGrow={1}>
									<Text wrap="truncate">{renderInline(e)}</Text>
								</Box>
								<Box width={2} flexShrink={0}>
									<Text>{open ? '›' : ' '}</Text>
								</Box>
							</Box>
						)
					})
				)}
			</Box>

			{firstOpenable !== null && (
				<Box marginTop={1}>
					<Text dimColor>{t.checkDetail.openFirstHint}</Text>
				</Box>
			)}
		</Box>
	)
}
