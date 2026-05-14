import { Spinner } from '@inkjs/ui'
import { Box, Text, useInput } from 'ink'
import { useEffect, useState } from 'react'
import { fetchJobAssetCounts, fetchJobs, type Job, makeClient } from '../../client/index.ts'
import { type Column, Table } from '../components/Table.tsx'
import { t } from '../i18n/en.ts'
import { useViewportWindow } from '../useViewport.ts'

interface Props {
	url: string
	auth?: string
	onSelect: (job: Job) => void
	onBack: () => void
}

export function JobsList({ url, auth, onSelect, onBack }: Props) {
	const [jobs, setJobs] = useState<Job[] | null>(null)
	const [counts, setCounts] = useState<Map<string, number>>(new Map())
	const [error, setError] = useState<string | null>(null)
	const [cursor, setCursor] = useState(0)

	useEffect(() => {
		const client = makeClient({ url, auth })
		let cancelled = false
		Promise.all([fetchJobs(client), fetchJobAssetCounts(client)])
			.then(([j, c]) => {
				if (cancelled) return
				const sorted = j.slice().sort((a, b) => a.name.localeCompare(b.name))
				setJobs(sorted)
				setCounts(c)
			})
			.catch((e) => {
				if (cancelled) return
				setError(String(e?.message ?? e))
			})
		return () => {
			cancelled = true
		}
	}, [url, auth])

	useInput((input, key) => {
		if (input === 'q' || key.escape || key.leftArrow) {
			onBack()
			return
		}
		if (!jobs || jobs.length === 0) return
		if (key.upArrow) setCursor((c) => (c <= 0 ? jobs.length - 1 : c - 1))
		if (key.downArrow) setCursor((c) => (c >= jobs.length - 1 ? 0 : c + 1))
		if (key.pageUp) setCursor((c) => Math.max(0, c - visible))
		if (key.pageDown) setCursor((c) => Math.min(jobs.length - 1, c + visible))
		if (input === 'g') setCursor(0)
		if (input === 'G') setCursor(jobs.length - 1)
		if (key.return) {
			const j = jobs[cursor]
			if (j) onSelect(j)
		}
	})

	const safeJobs = jobs ?? []
	const { start, end, visible } = useViewportWindow(safeJobs.length, cursor, 8)

	if (error)
		return (
			<Text color="red">
				{t.common.errorPrefix} {error}
			</Text>
		)
	if (!jobs) return <Spinner label={t.common.loading} />
	if (jobs.length === 0) return <Text dimColor>{t.jobs.empty}</Text>

	const maxName = Math.max(5, ...jobs.map((j) => j.name.length))
	const nameWidth = Math.min(60, maxName)

	const columns: Column<Job>[] = [
		{
			header: t.jobs.header.job,
			width: nameWidth,
			render: (j) => ({
				text: j.name,
				dim: j.name.startsWith('__'),
			}),
		},
		{
			header: t.jobs.header.assets,
			width: 7,
			render: (j) => ({ text: String(counts.get(j.name) ?? 0) }),
		},
	]

	const focused = jobs[cursor]

	return (
		<Box flexDirection="column">
			<Table
				columns={columns}
				data={jobs}
				cursor={cursor}
				viewport={{ start, end, visible, total: jobs.length }}
			/>
			{focused?.description && (
				<Box marginTop={1} flexDirection="column">
					<Text bold>{t.job.descriptionHeader}</Text>
					<Text>{focused.description}</Text>
				</Box>
			)}
		</Box>
	)
}
