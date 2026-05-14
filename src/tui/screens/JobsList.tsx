import { Spinner } from '@inkjs/ui'
import { Box, Text, useInput } from 'ink'
import { useEffect, useState } from 'react'
import { fetchJobs, type Job, makeClient } from '../../client/index.ts'
import { useViewportWindow } from '../useViewport.ts'

interface Props {
	url: string
	auth?: string
	onSelect: (job: Job) => void
	onBack: () => void
}

export function JobsList({ url, auth, onSelect, onBack }: Props) {
	const [jobs, setJobs] = useState<Job[] | null>(null)
	const [error, setError] = useState<string | null>(null)
	const [cursor, setCursor] = useState(0)

	useEffect(() => {
		const client = makeClient({ url, auth })
		let cancelled = false
		fetchJobs(client)
			.then((j) => {
				if (cancelled) return
				const sorted = j.slice().sort((a, b) => a.name.localeCompare(b.name))
				setJobs(sorted)
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
		if (key.upArrow) setCursor((c) => Math.max(0, c - 1))
		if (key.downArrow) setCursor((c) => Math.min(jobs.length - 1, c + 1))
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

	if (error) return <Text color="red">Error: {error}</Text>
	if (!jobs) return <Spinner label="Loading jobs..." />
	if (jobs.length === 0) return <Text dimColor>No jobs found.</Text>

	const maxName = Math.max(5, ...jobs.map((j) => j.name.length))
	const nameWidth = Math.min(60, maxName)
	const slice = jobs.slice(start, end)

	return (
		<Box flexDirection="column">
			<Box>
				<Box width={2} />
				<Box width={nameWidth + 2}>
					<Text bold>JOB</Text>
				</Box>
				<Box flexGrow={1}>
					<Text bold>DESCRIPTION</Text>
				</Box>
			</Box>
			{slice.map((j, sliceIdx) => {
				const i = start + sliceIdx
				const selected = i === cursor
				const internal = j.name.startsWith('__')
				return (
					<Box key={j.name}>
						<Box width={2} flexShrink={0}>
							<Text color="cyan">{selected ? '›' : ' '}</Text>
						</Box>
						<Box width={nameWidth + 2} flexShrink={0}>
							<Text
								color={selected ? 'cyan' : undefined}
								dimColor={internal && !selected}
								wrap="truncate"
							>
								{j.name}
							</Text>
						</Box>
						<Box flexGrow={1}>
							<Text wrap="truncate">{(j.description ?? '').replace(/\s+/g, ' ').trim()}</Text>
						</Box>
					</Box>
				)
			})}
			{jobs.length > visible && (
				<Text dimColor>
					{cursor + 1}/{jobs.length} {start > 0 ? '↑' : ' '}
					{end < jobs.length ? '↓' : ' '}
				</Text>
			)}
		</Box>
	)
}
