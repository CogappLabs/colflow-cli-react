import { Spinner } from '@inkjs/ui'
import { Box, Text, useInput } from 'ink'
import { useEffect, useState } from 'react'
import { fetchRuns, makeClient, type Run } from '../../client/index.ts'
import { durationStr } from '../../diff/index.ts'
import { formatTimestamp, statusColour, timeAgo, tsToSeconds } from '../../format/index.ts'
import { type Column, Table } from '../components/Table.tsx'
import { t } from '../i18n/en.ts'
import { useViewportWindow } from '../useViewport.ts'

interface Props {
	url: string
	auth?: string
	onSelect: (run: Run) => void
	onQuit: () => void
	onDiff: (runId1: string, runId2: string) => void
}

export function RunsList({ url, auth, onSelect, onQuit, onDiff }: Props) {
	const [runs, setRuns] = useState<Run[] | null>(null)
	const [error, setError] = useState<string | null>(null)
	const [cursor, setCursor] = useState(0)
	const [diffMarks, setDiffMarks] = useState<string[]>([])

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
		if (key.upArrow) setCursor((c) => (c <= 0 ? runs.length - 1 : c - 1))
		if (key.downArrow) setCursor((c) => (c >= runs.length - 1 ? 0 : c + 1))
		if (key.pageUp) setCursor((c) => Math.max(0, c - visible))
		if (key.pageDown) setCursor((c) => Math.min(runs.length - 1, c + visible))
		if (input === 'g') setCursor(0)
		if (input === 'G') setCursor(runs.length - 1)
		if (input === 'd') {
			const r = runs[cursor]
			if (!r) return
			if (diffMarks.length === 2 && diffMarks[0] && diffMarks[1]) {
				onDiff(diffMarks[0], diffMarks[1])
				return
			}
			setDiffMarks((m) => {
				if (m.includes(r.runId)) return m.filter((x) => x !== r.runId)
				if (m.length >= 2) return [m[1]!, r.runId]
				return [...m, r.runId]
			})
			return
		}
		if (input === 'D') {
			setDiffMarks([])
			return
		}
		if (key.return) {
			const r = runs[cursor]
			if (r) onSelect(r)
		}
	})

	const safeRuns = runs ?? []
	const { start, end, visible } = useViewportWindow(safeRuns.length, cursor, 8)

	if (error)
		return (
			<Text color="red">
				{t.common.errorPrefix} {error}
			</Text>
		)
	if (!runs) return <Spinner label={t.common.loading} />
	if (runs.length === 0) return <Text dimColor>{t.runs.empty}</Text>

	const maxJobLen = Math.max(3, ...runs.map((r) => r.jobName.length))
	const jobWidth = Math.min(40, maxJobLen)

	// Diff mark column: [1] or [2] in cyan, blank otherwise. Not a Set — ordered.
	const columns: Column<Run>[] = [
		{
			header: '',
			width: 3,
			render: (r) => {
				const markIdx = diffMarks.indexOf(r.runId)
				return markIdx >= 0 ? { text: `[${markIdx + 1}]`, colour: 'cyan' } : { text: '' }
			},
		},
		{
			header: t.runs.header.status,
			width: 8,
			render: (r) => ({ text: r.status, colour: statusColour(r.status) }),
		},
		{
			header: t.runs.header.job,
			width: jobWidth,
			render: (r) => ({ text: r.jobName }),
		},
		{
			header: t.runs.header.started,
			width: 20,
			render: (r) => ({ text: formatTimestamp(r.startTime) }),
		},
		{
			header: t.runs.header.age,
			width: 8,
			render: (r) => ({ text: timeAgo(r.endTime ?? r.startTime) }),
		},
		{
			header: t.runs.header.duration,
			width: 9,
			render: (r) => {
				const start = tsToSeconds(r.startTime)
				const end = tsToSeconds(r.endTime) ?? Math.floor(Date.now() / 1000)
				if (start == null) return { text: '-' }
				return { text: durationStr(r.startTime, end) }
			},
		},
		{
			header: t.runs.header.assets,
			width: 7,
			render: (r) => ({ text: r.assetSelection ? String(r.assetSelection.length) : '-' }),
		},
		{
			header: t.runs.header.id,
			flex: true,
			render: (r) => ({ text: r.runId.slice(0, 12) }),
		},
	]

	return (
		<Box flexDirection="column">
			{diffMarks.length > 0 && (
				<Box marginBottom={1}>
					<Text>
						<Text bold>Diff:</Text> {t.runs.diffMarked(diffMarks.length)}{' '}
						{diffMarks.length === 2 ? (
							<>
								Press <Text color="cyan">d</Text> to compare · <Text color="cyan">D</Text> to clear
							</>
						) : (
							<>
								Press <Text color="cyan">d</Text> on another run, or <Text color="cyan">D</Text> to
								clear
							</>
						)}
					</Text>
				</Box>
			)}
			<Table
				columns={columns}
				data={runs}
				cursor={cursor}
				viewport={{ start, end, visible, total: runs.length }}
			/>
		</Box>
	)
}
