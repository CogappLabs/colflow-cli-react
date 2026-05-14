import { Spinner } from '@inkjs/ui'
import { Box, Text, useInput } from 'ink'
import { useEffect, useState } from 'react'
import { fetchRuns, makeClient, type Run } from '../../client/index.ts'
import { formatTimestamp, statusColour, timeAgo } from '../../format/index.ts'
import { useViewportWindow } from '../useViewport.ts'

interface Props {
	url: string
	auth?: string
	onSelect: (run: Run) => void
	onQuit: () => void
}

export function RunsList({ url, auth, onSelect, onQuit }: Props) {
	const [runs, setRuns] = useState<Run[] | null>(null)
	const [error, setError] = useState<string | null>(null)
	const [cursor, setCursor] = useState(0)

	useEffect(() => {
		const client = makeClient({ url, auth })
		let cancelled = false
		let timer: ReturnType<typeof setTimeout> | null = null
		const tick = async () => {
			try {
				const r = await fetchRuns(client, 25)
				if (cancelled) return
				setRuns(r)
				setError(null)
			} catch (e) {
				if (cancelled) return
				setError(String((e as Error)?.message ?? e))
			}
			timer = setTimeout(tick, 5000)
		}
		tick()
		return () => {
			cancelled = true
			if (timer) clearTimeout(timer)
		}
	}, [url, auth])

	useInput((input, key) => {
		if (!runs) return
		if (input === 'q' || key.escape || key.leftArrow) {
			onQuit()
			return
		}
		if (key.upArrow) setCursor((c) => Math.max(0, c - 1))
		if (key.downArrow) setCursor((c) => Math.min(runs.length - 1, c + 1))
		if (key.pageUp) setCursor((c) => Math.max(0, c - visible))
		if (key.pageDown) setCursor((c) => Math.min(runs.length - 1, c + visible))
		if (input === 'g') setCursor(0)
		if (input === 'G') setCursor(runs.length - 1)
		if (key.return) {
			const r = runs[cursor]
			if (r) onSelect(r)
		}
	})

	const safeRuns = runs ?? []
	const { start, end, visible } = useViewportWindow(safeRuns.length, cursor, 8)

	if (error) return <Text color="red">Error: {error}</Text>
	if (!runs) return <Spinner label="Loading runs..." />
	if (runs.length === 0) return <Text dimColor>No runs found.</Text>

	const maxJobLen = Math.max(3, ...runs.map((r) => r.jobName.length))
	const jobWidth = Math.min(40, maxJobLen)
	const slice = runs.slice(start, end)

	return (
		<Box flexDirection="column">
			<Box flexDirection="column">
				<Box>
					<Box width={2} />
					<Box width={10}>
						<Text bold>STATUS</Text>
					</Box>
					<Box width={jobWidth + 2}>
						<Text bold>JOB</Text>
					</Box>
					<Box width={22}>
						<Text bold>STARTED</Text>
					</Box>
					<Box width={10}>
						<Text bold>AGE</Text>
					</Box>
					<Box flexGrow={1}>
						<Text bold>ID</Text>
					</Box>
				</Box>
				{slice.map((r, sliceIdx) => {
					const i = start + sliceIdx
					const selected = i === cursor
					return (
						<Box key={r.runId}>
							<Box width={2} flexShrink={0}>
								<Text color="cyan">{selected ? '›' : ' '}</Text>
							</Box>
							<Box width={10} flexShrink={0}>
								<Text color={statusColour(r.status)}>{r.status}</Text>
							</Box>
							<Box width={jobWidth + 2} flexShrink={0}>
								<Text color={selected ? 'cyan' : undefined} wrap="truncate">
									{r.jobName}
								</Text>
							</Box>
							<Box width={22} flexShrink={0}>
								<Text dimColor>{formatTimestamp(r.startTime)}</Text>
							</Box>
							<Box width={10} flexShrink={0}>
								<Text dimColor>{timeAgo(r.endTime ?? r.startTime)}</Text>
							</Box>
							<Box flexGrow={1}>
								<Text dimColor>{r.runId.slice(0, 12)}</Text>
							</Box>
						</Box>
					)
				})}
				{runs.length > visible && (
					<Text dimColor>
						{cursor + 1}/{runs.length} {start > 0 ? '↑' : ' '}
						{end < runs.length ? '↓' : ' '}
					</Text>
				)}
			</Box>
		</Box>
	)
}
