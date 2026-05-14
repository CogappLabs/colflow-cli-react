import { Spinner } from '@inkjs/ui'
import { Box, Text, useInput } from 'ink'
import { useEffect, useState } from 'react'
import { fetchHits, resolveKey, resolveUrl, type SearchHit } from '../../es/index.ts'
import { t } from '../i18n/en.ts'

interface Props {
	index: string
	onBack: () => void
	onDetails: (title: string, body: string) => void
}

function summarise(src: Record<string, unknown>): string {
	const title =
		(src.title as string | undefined) ??
		(src.name as string | undefined) ??
		(src.objectName as string | undefined) ??
		''
	return title || t.esSample.noTitleField
}

export function ESSample({ index, onBack, onDetails }: Props) {
	const [hits, setHits] = useState<SearchHit[] | null>(null)
	const [error, setError] = useState<string | null>(null)
	const [cursor, setCursor] = useState(0)
	const base = resolveUrl(undefined)
	const key = resolveKey(undefined)

	useEffect(() => {
		let cancelled = false
		fetchHits(base, index, key, false, 10)
			.then((h) => !cancelled && setHits(h))
			.catch((e) => !cancelled && setError(String(e?.message ?? e)))
		return () => {
			cancelled = true
		}
	}, [base, key, index])

	useInput((input, key2) => {
		if (input === 'q' || key2.escape || key2.leftArrow) {
			onBack()
			return
		}
		if (!hits || hits.length === 0) return
		if (key2.upArrow) setCursor((c) => (c <= 0 ? hits.length - 1 : c - 1))
		if (key2.downArrow) setCursor((c) => (c >= hits.length - 1 ? 0 : c + 1))
		if (key2.return) {
			const h = hits[cursor]
			if (h) {
				onDetails(`${index} / ${h._id}`, JSON.stringify(h._source, null, 2))
			}
		}
	})

	if (error) return <Text color="red">{error}</Text>
	if (!hits) return <Spinner label={t.esSample.loading} />
	if (hits.length === 0) return <Text dimColor>{t.esSample.empty}</Text>

	const maxId = Math.max(...hits.map((h) => h._id.length))

	return (
		<Box flexDirection="column">
			<Text bold color="cyan">
				{t.esSample.title(index, hits.length)}
			</Text>
			<Box marginTop={1} flexDirection="column">
				{hits.map((h, i) => {
					const selected = i === cursor
					return (
						<Box key={h._id}>
							<Box width={2} flexShrink={0}>
								<Text color="cyan">{selected ? '›' : ' '}</Text>
							</Box>
							<Box width={maxId + 2} flexShrink={0}>
								<Text color={selected ? 'cyan' : undefined} wrap="truncate">
									{h._id}
								</Text>
							</Box>
							<Box flexGrow={1}>
								<Text wrap="truncate">{summarise(h._source)}</Text>
							</Box>
						</Box>
					)
				})}
			</Box>
			<Box marginTop={1}>
				<Text dimColor>{t.esSample.footer}</Text>
			</Box>
		</Box>
	)
}
