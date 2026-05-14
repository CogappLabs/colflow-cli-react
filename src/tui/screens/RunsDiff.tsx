import { Spinner } from '@inkjs/ui'
import { Box, Text, useInput } from 'ink'
import { useEffect, useState } from 'react'
import { fetchRun, makeClient, type RunDetail } from '../../client/index.ts'
import { computeDiff, type DiffRow, durationStr } from '../../diff/index.ts'
import { statusColour, timeAgo } from '../../format/index.ts'
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
		if (key.upArrow) setCursor((c) => Math.max(0, c - 1))
		if (key.downArrow) setCursor((c) => Math.min(diffs.length - 1, c + 1))
		if (key.pageUp) setCursor((c) => Math.max(0, c - visible))
		if (key.pageDown) setCursor((c) => Math.min(diffs.length - 1, c + visible))
		if (input === 'g') setCursor(0)
		if (input === 'G') setCursor(diffs.length - 1)
	})

	if (error) return <Text color="red">Error: {error}</Text>
	if (!r1 || !r2) return <Spinner label="Loading runs..." />

	const id1 = r1.runId.slice(0, 8)
	const id2 = r2.runId.slice(0, 8)
	const slice = diffs.slice(start, end)
	const maxStep = Math.max(4, ...diffs.map((d) => d.step.length))

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
						<Text bold>Status</Text>
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
						<Text bold>Job</Text>
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
						<Text bold>Duration</Text>
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
						<Text bold>Started</Text>
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
						<Text bold>Succeeded</Text>
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
						<Text bold>Failed</Text>
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
				<Text bold>{diffs.length} step(s) differ</Text>
				{diffs.length === 0 ? (
					<Text dimColor>(no differences)</Text>
				) : (
					<>
						<Box marginTop={1}>
							<Box width={2} />
							<Box width={maxStep + 2} flexShrink={0}>
								<Text bold>STEP</Text>
							</Box>
							<Box width={12} flexShrink={0}>
								<Text bold>{id1}</Text>
							</Box>
							<Box flexGrow={1}>
								<Text bold>{id2}</Text>
							</Box>
						</Box>
						{slice.map((d, sliceIdx) => {
							const i = start + sliceIdx
							const selected = i === cursor
							return (
								<Box key={d.step}>
									<Box width={2} flexShrink={0}>
										<Text color="cyan">{selected ? '›' : ' '}</Text>
									</Box>
									<Box width={maxStep + 2} flexShrink={0}>
										<Text color={selected ? 'cyan' : undefined} wrap="truncate">
											{d.step}
										</Text>
									</Box>
									<Box width={12} flexShrink={0}>
										<Text color={colourFor(d.left)}>{d.left}</Text>
									</Box>
									<Box flexGrow={1}>
										<Text color={colourFor(d.right)}>{d.right}</Text>
									</Box>
								</Box>
							)
						})}
						{diffs.length > visible && (
							<Text dimColor>
								{cursor + 1}/{diffs.length} {start > 0 ? '↑' : ' '}
								{end < diffs.length ? '↓' : ' '}
							</Text>
						)}
					</>
				)}
			</Box>
		</Box>
	)
}
