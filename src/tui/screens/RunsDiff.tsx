import { Spinner } from '@inkjs/ui'
import { Box, Text, useInput } from 'ink'
import { useEffect, useState } from 'react'
import { fetchRun, makeClient, type RunDetail } from '../../client/index.ts'
import { computeDiff, type DiffRow, durationStr } from '../../diff/index.ts'
import { statusColour, timeAgo } from '../../format/index.ts'
import { type Column, Table } from '../components/Table.tsx'
import { t } from '../i18n/en.ts'
import { useViewportWindow } from '../useViewport.ts'

interface Props {
	url: string
	auth?: string
	runId1: string
	runId2: string
	onBack: () => void
}

function colourFor(s: DiffRow['left']): string {
	if (s === 'FAILED') return 'red'
	if (s === 'MISSING') return 'yellow'
	return 'green'
}

export function RunsDiff({ url, auth, runId1, runId2, onBack }: Props) {
	const [r1, setR1] = useState<RunDetail | null>(null)
	const [r2, setR2] = useState<RunDetail | null>(null)
	const [error, setError] = useState<string | null>(null)
	const [cursor, setCursor] = useState(0)

	useEffect(() => {
		const client = makeClient({ url, auth })
		Promise.all([fetchRun(client, runId1), fetchRun(client, runId2)])
			.then(([a, b]) => {
				setR1(a)
				setR2(b)
			})
			.catch((e) => setError(String(e?.message ?? e)))
	}, [url, auth, runId1, runId2])

	const diffs = r1 && r2 ? computeDiff(r1, r2) : []
	const { start, end, visible } = useViewportWindow(diffs.length, cursor, 14)

	useInput((input, key) => {
		if (input === 'q' || key.escape || key.leftArrow) {
			onBack()
			return
		}
		if (diffs.length === 0) return
		if (key.upArrow) setCursor((c) => (c <= 0 ? diffs.length - 1 : c - 1))
		if (key.downArrow) setCursor((c) => (c >= diffs.length - 1 ? 0 : c + 1))
		if (key.pageUp) setCursor((c) => Math.max(0, c - visible))
		if (key.pageDown) setCursor((c) => Math.min(diffs.length - 1, c + visible))
		if (input === 'g') setCursor(0)
		if (input === 'G') setCursor(diffs.length - 1)
	})

	if (error)
		return (
			<Text color="red">
				{t.common.errorPrefix} {error}
			</Text>
		)
	if (!r1 || !r2) return <Spinner label={t.common.loading} />

	const id1 = r1.runId.slice(0, 8)
	const id2 = r2.runId.slice(0, 8)
	const maxStep = Math.max(4, ...diffs.map((d) => d.step.length))

	const columns: Column<DiffRow>[] = [
		{
			header: t.runsDiff.stepHeader,
			width: maxStep,
			render: (d) => ({ text: d.step }),
		},
		{
			header: id1,
			width: 10,
			render: (d) => ({ text: d.left, colour: colourFor(d.left) }),
		},
		{
			header: id2,
			flex: true,
			render: (d) => ({ text: d.right, colour: colourFor(d.right) }),
		},
	]

	return (
		<Box flexDirection="column">
			<Box flexDirection="column">
				<Box>
					<Box width={12} flexShrink={0} />
					<Box width={24} flexShrink={0}>
						<Text bold>{id1}</Text>
					</Box>
					<Box flexGrow={1}>
						<Text bold>{id2}</Text>
					</Box>
				</Box>
				<Box>
					<Box width={12} flexShrink={0}>
						<Text bold>{t.runsDiff.statusLabel}</Text>
					</Box>
					<Box width={24} flexShrink={0}>
						<Text color={statusColour(r1.status)}>{r1.status}</Text>
					</Box>
					<Box flexGrow={1}>
						<Text color={statusColour(r2.status)}>{r2.status}</Text>
					</Box>
				</Box>
				<Box>
					<Box width={12} flexShrink={0}>
						<Text bold>{t.runsDiff.jobLabel}</Text>
					</Box>
					<Box width={24} flexShrink={0}>
						<Text wrap="truncate">{r1.jobName}</Text>
					</Box>
					<Box flexGrow={1}>
						<Text wrap="truncate">{r2.jobName}</Text>
					</Box>
				</Box>
				<Box>
					<Box width={12} flexShrink={0}>
						<Text bold>{t.runsDiff.durationLabel}</Text>
					</Box>
					<Box width={24} flexShrink={0}>
						<Text>{durationStr(r1.startTime, r1.endTime)}</Text>
					</Box>
					<Box flexGrow={1}>
						<Text>{durationStr(r2.startTime, r2.endTime)}</Text>
					</Box>
				</Box>
				<Box>
					<Box width={12} flexShrink={0}>
						<Text bold>{t.runsDiff.startedLabel}</Text>
					</Box>
					<Box width={24} flexShrink={0}>
						<Text>{timeAgo(r1.startTime)}</Text>
					</Box>
					<Box flexGrow={1}>
						<Text>{timeAgo(r2.startTime)}</Text>
					</Box>
				</Box>
				<Box>
					<Box width={12} flexShrink={0}>
						<Text bold>{t.runsDiff.succeededLabel}</Text>
					</Box>
					<Box width={24} flexShrink={0}>
						<Text>{r1.stats?.stepsSucceeded ?? 0}</Text>
					</Box>
					<Box flexGrow={1}>
						<Text>{r2.stats?.stepsSucceeded ?? 0}</Text>
					</Box>
				</Box>
				<Box>
					<Box width={12} flexShrink={0}>
						<Text bold>{t.runsDiff.failedLabel}</Text>
					</Box>
					<Box width={24} flexShrink={0}>
						<Text>{r1.stats?.stepsFailed ?? 0}</Text>
					</Box>
					<Box flexGrow={1}>
						<Text>{r2.stats?.stepsFailed ?? 0}</Text>
					</Box>
				</Box>
			</Box>

			<Box marginTop={1} flexDirection="column">
				<Text bold>{t.runsDiff.diffCount(diffs.length)}</Text>
				{diffs.length === 0 ? (
					<Text dimColor>{t.runsDiff.noDifferences}</Text>
				) : (
					<Table
						columns={columns}
						data={diffs}
						cursor={cursor}
						viewport={{ start, end, visible, total: diffs.length }}
					/>
				)}
			</Box>
		</Box>
	)
}
