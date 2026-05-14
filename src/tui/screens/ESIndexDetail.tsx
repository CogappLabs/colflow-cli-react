import { Spinner } from '@inkjs/ui'
import { Box, Text, useInput } from 'ink'
import { useEffect, useState } from 'react'
import {
	type EsAlias,
	type EsIndex,
	fetchAliases,
	fetchIndex,
	fetchIndexStats,
	humanBytesStr,
	type IndexStats,
	resolveKey,
	resolveUrl,
	statusColour,
} from '../../es/index.ts'
import { t } from '../i18n/en.ts'

interface Props {
	index: string
	onBack: () => void
	onSchema: (index: string) => void
	onSample: (index: string) => void
}

export function ESIndexDetail({ index, onBack, onSchema, onSample }: Props) {
	const [info, setInfo] = useState<EsIndex | null>(null)
	const [stats, setStats] = useState<IndexStats | null>(null)
	const [aliases, setAliases] = useState<EsAlias[]>([])
	const [error, setError] = useState<string | null>(null)
	const [loading, setLoading] = useState(true)

	const base = resolveUrl(undefined)
	const key = resolveKey(undefined)

	useEffect(() => {
		let cancelled = false
		Promise.all([
			fetchIndex(base, index, key, false),
			fetchIndexStats(base, index, key, false),
			fetchAliases(base, key, false).catch(() => [] as EsAlias[]),
		])
			.then(([ix, st, ali]) => {
				if (cancelled) return
				setInfo(ix)
				setStats(st)
				setAliases(ali.filter((a) => a.index === index))
			})
			.catch((e) => !cancelled && setError(String(e?.message ?? e)))
			.finally(() => !cancelled && setLoading(false))
		return () => {
			cancelled = true
		}
	}, [base, key, index])

	useInput((input, key2) => {
		if (input === 'q' || key2.escape || key2.leftArrow) {
			onBack()
			return
		}
		if (input === 's') onSchema(index)
		if (input === 'd') onSample(index)
	})

	if (loading) return <Spinner label={t.esIndexDetail.loading} />
	if (error) return <Text color="red">{error}</Text>

	const docs = stats?.docs ?? Number(info?.['docs.count'] ?? 0)
	const sizeStr =
		stats && stats.storeBytes > 0
			? humanBytesStr(String(stats.storeBytes))
			: info && info['store.size'] && info['store.size'] !== '0'
				? humanBytesStr(info['store.size'])
				: '-'

	return (
		<Box flexDirection="column">
			<Text bold color="cyan">
				{index}
			</Text>
			<Box marginTop={1} flexDirection="column">
				{info && (
					<Text>
						<Text bold>{t.esIndexDetail.healthLabel}</Text>{' '}
						<Text color={statusColour(info.health)}>{info.health}</Text>
						{'   '}
						<Text bold>{t.esIndexDetail.statusLabel}</Text> {info.status}
					</Text>
				)}
				<Text>
					<Text bold>{t.esIndexDetail.docsLabel}</Text> {docs.toLocaleString()}
					{'   '}
					<Text bold>{t.esIndexDetail.sizeLabel}</Text> {sizeStr}
				</Text>
				{aliases.length > 0 && (
					<Text>
						<Text bold>{t.esIndexDetail.aliasesLabel}</Text>{' '}
						{aliases
							.map(
								(a) =>
									`${a.alias}${a.is_write_index === 'true' ? ` ${t.esIndexDetail.writeSuffix}` : ''}`,
							)
							.join(', ')}
					</Text>
				)}
			</Box>

			<Box marginTop={2} flexDirection="column">
				<Text>
					<Text color="cyan">s</Text> {t.esIndexDetail.schemaAction}
				</Text>
				<Text>
					<Text color="cyan">d</Text> {t.esIndexDetail.sampleAction}
				</Text>
			</Box>
		</Box>
	)
}
