import { Spinner, TextInput } from '@inkjs/ui'
import { Box, Text, useInput } from 'ink'
import { useEffect, useMemo, useState } from 'react'
import {
	type EsAlias,
	type EsIndex,
	ESError,
	fetchAliases,
	fetchHealth,
	fetchIndices,
	type Health,
	hintForESError,
	humanBytesStr,
	resolveKey,
	resolveUrl,
	statusColour,
} from '../../es/index.ts'
import { type Column, Table } from '../components/Table.tsx'
import { t } from '../i18n/en.ts'
import { useViewportWindow } from '../useViewport.ts'

interface Props {
	onBack: () => void
}

type Tab = 'indices' | 'aliases'

export function ESCheck({ onBack }: Props) {
	const [health, setHealth] = useState<Health | null>(null)
	const [indices, setIndices] = useState<EsIndex[] | null>(null)
	const [aliases, setAliases] = useState<EsAlias[] | null>(null)
	const [error, setError] = useState<string | null>(null)
	const [hint, setHint] = useState<string | null>(null)
	const [tab, setTab] = useState<Tab>('indices')
	const [cursor, setCursor] = useState(0)
	const [filter, setFilter] = useState('')
	const [filterInput, setFilterInput] = useState(false)
	const [loading, setLoading] = useState(true)
	const [tick, setTick] = useState(0)

	const base = resolveUrl(undefined)
	const key = resolveKey(undefined)

	useEffect(() => {
		let cancelled = false
		const run = async () => {
			setLoading(true)
			try {
				const h = await fetchHealth(base, key, false)
				if (cancelled) return
				setHealth(h)
				const [idx, ali] = await Promise.all([
					fetchIndices(base, key, false),
					fetchAliases(base, key, false).catch(() => [] as EsAlias[]),
				])
				if (cancelled) return
				setIndices(idx)
				setAliases(ali)
				setError(null)
				setHint(null)
			} catch (err) {
				if (cancelled) return
				if (err instanceof ESError) {
					setError(`${err.status} ${err.type}: ${err.reason || err.message}`)
					setHint(hintForESError(err, !!key))
				} else {
					setError(String((err as Error)?.message ?? err))
					setHint(null)
				}
			} finally {
				if (!cancelled) setLoading(false)
			}
		}
		run()
		return () => {
			cancelled = true
		}
	}, [base, key, tick])

	const filteredIndices = useMemo(() => {
		if (!indices) return []
		const v = indices.filter((ix) => !ix.index.startsWith('.'))
		if (!filter) return v
		const f = filter.toLowerCase()
		return v.filter((ix) => ix.index.toLowerCase().includes(f))
	}, [indices, filter])

	const filteredAliases = useMemo(() => {
		if (!aliases) return []
		const v = aliases.filter((a) => !a.alias.startsWith('.'))
		if (!filter) return v
		const f = filter.toLowerCase()
		return v.filter((a) => a.alias.toLowerCase().includes(f) || a.index.toLowerCase().includes(f))
	}, [aliases, filter])

	const filteredCount = tab === 'indices' ? filteredIndices.length : filteredAliases.length
	const { start, end, visible } = useViewportWindow(filteredCount, cursor, 14)

	useInput((input, key2) => {
		if (filterInput) return
		if (input === 'q' || key2.escape || key2.leftArrow) {
			onBack()
			return
		}
		if (input === 'r') {
			setTick((t) => t + 1)
			return
		}
		if (input === 'a') {
			setTab('aliases')
			setCursor(0)
			return
		}
		if (input === 'i') {
			setTab('indices')
			setCursor(0)
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
		if (filteredCount === 0) return
		if (key2.upArrow) setCursor((c) => (c <= 0 ? filteredCount - 1 : c - 1))
		if (key2.downArrow) setCursor((c) => (c >= filteredCount - 1 ? 0 : c + 1))
		if (key2.pageUp) setCursor((c) => Math.max(0, c - visible))
		if (key2.pageDown) setCursor((c) => Math.min(filteredCount - 1, c + visible))
		if (input === 'g') setCursor(0)
		if (input === 'G') setCursor(filteredCount - 1)
	})

	if (loading && !health) return <Spinner label={t.esCheck.connecting} />

	const indexColumns: Column<EsIndex>[] = [
		{ header: t.esCheck.header.index, flex: true, render: (ix) => ({ text: ix.index }) },
		{
			header: t.esCheck.header.health,
			width: 7,
			render: (ix) => ({ text: ix.health, colour: statusColour(ix.health) }),
		},
		{ header: t.esCheck.header.docs, width: 12, render: (ix) => ({ text: ix['docs.count'] }) },
		{
			header: t.esCheck.header.size,
			width: 10,
			render: (ix) => {
				const s = ix['store.size']
				return { text: !s || s === '0' ? '-' : humanBytesStr(s) }
			},
		},
	]
	const aliasColumns: Column<EsAlias>[] = [
		{ header: t.esCheck.aliasHeader.alias, width: 40, render: (a) => ({ text: a.alias }) },
		{ header: t.esCheck.aliasHeader.index, flex: true, render: (a) => ({ text: a.index }) },
		{
			header: t.esCheck.aliasHeader.write,
			width: 6,
			render: (a) => {
				if (a.is_write_index === 'true') return { text: '✓', colour: 'green' }
				if (a.is_write_index === 'false') return { text: '' }
				return { text: '?' }
			},
		},
	]

	return (
		<Box flexDirection="column">
			<Box flexDirection="column">
				<Text>
					<Text bold>{t.esCheck.urlLabel}</Text> {base}
				</Text>
				{health && (
					<>
						<Text>
							<Text bold>{t.esCheck.clusterLabel}</Text> {health.cluster_name}
							{'   '}
							<Text bold>{t.esCheck.statusLabel}</Text>{' '}
							<Text color={statusColour(health.status)}>{health.status}</Text>
						</Text>
						{!health.serverless && (
							<Text>
								<Text bold>{t.esCheck.nodesLabel}</Text> {health.number_of_nodes ?? 0}{' '}
								{t.esCheck.dataPrefix} {health.number_of_data_nodes ?? 0}){'   '}
								<Text bold>{t.esCheck.shardsLabel}</Text> {health.active_shards ?? 0}{' '}
								{t.esCheck.activeSuffix} {health.active_primary_shards ?? 0}{' '}
								{t.esCheck.primarySuffix}
								{(health.unassigned_shards ?? 0) > 0 && (
									<>
										{'   '}
										<Text color="red">
											{health.unassigned_shards} {t.esCheck.unassignedSuffix}
										</Text>
									</>
								)}
							</Text>
						)}
					</>
				)}
				{error && (
					<Box flexDirection="column" marginTop={1}>
						<Text color="red">{error}</Text>
						{hint && (
							<Text color="yellow">
								{t.esCheck.hintLabel} {hint}
							</Text>
						)}
					</Box>
				)}
			</Box>

			{(filterInput || filter) && (
				<Box marginTop={1}>
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
							{t.esCheck.filterLabel}{' '}
							<Text color="cyan" bold>
								{filter}
							</Text>{' '}
							({filteredCount}/{(tab === 'indices' ? indices : aliases)?.length ?? 0}) —{' '}
							{t.esCheck.filterControls}
						</Text>
					)}
				</Box>
			)}

			<Box marginTop={1}>
				<Text>
					<Text color={tab === 'indices' ? 'cyan' : undefined} bold={tab === 'indices'}>
						{t.esCheck.indicesTab(indices?.length ?? 0)}
					</Text>
					{'   '}
					<Text color={tab === 'aliases' ? 'cyan' : undefined} bold={tab === 'aliases'}>
						{t.esCheck.aliasesTab(aliases?.length ?? 0)}
					</Text>
				</Text>
			</Box>

			<Box marginTop={1} flexDirection="column">
				{tab === 'indices' ? (
					indices && filteredIndices.length > 0 ? (
						<Table
							columns={indexColumns}
							data={filteredIndices}
							cursor={cursor}
							viewport={{ start, end, visible, total: filteredIndices.length }}
						/>
					) : indices ? (
						<Text dimColor>(no indices)</Text>
					) : null
				) : aliases && filteredAliases.length > 0 ? (
					<Table
						columns={aliasColumns}
						data={filteredAliases}
						cursor={cursor}
						viewport={{ start, end, visible, total: filteredAliases.length }}
					/>
				) : aliases ? (
					<Text dimColor>{t.esCheck.noAliases}</Text>
				) : null}
			</Box>
		</Box>
	)
}
