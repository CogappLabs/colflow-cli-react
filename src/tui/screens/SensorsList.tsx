import { Spinner } from '@inkjs/ui'
import { Box, Text, useInput } from 'ink'
import { useEffect, useState } from 'react'
import { fetchSensors, makeClient, type SensorState } from '../../client/index.ts'
import { timeAgo } from '../../format/index.ts'
import { useViewportWindow } from '../useViewport.ts'

interface Props {
	url: string
	auth?: string
	onBack: () => void
}

function statusColour(s: string): string {
	if (s === 'RUNNING') return 'green'
	if (s === 'STOPPED') return 'red'
	return 'yellow'
}

function tickColour(s: string): string | undefined {
	if (s === 'SUCCESS') return 'green'
	if (s === 'FAILURE') return 'red'
	return undefined
}

export function SensorsList({ url, auth, onBack }: Props) {
	const [sensors, setSensors] = useState<SensorState[] | null>(null)
	const [error, setError] = useState<string | null>(null)
	const [cursor, setCursor] = useState(0)

	useEffect(() => {
		const client = makeClient({ url, auth })
		let cancelled = false
		fetchSensors(client)
			.then((s) => {
				if (cancelled) return
				const sorted = s.slice().sort((a, b) => a.name.localeCompare(b.name))
				setSensors(sorted)
			})
			.catch((e) => {
				if (cancelled) return
				setError(String(e?.message ?? e))
			})
		return () => {
			cancelled = true
		}
	}, [url, auth])

	const safeSensors = sensors ?? []
	const { start, end, visible } = useViewportWindow(safeSensors.length, cursor, 10)

	useInput((input, key) => {
		if (input === 'q' || key.escape || key.leftArrow) {
			onBack()
			return
		}
		if (!sensors || sensors.length === 0) return
		if (key.upArrow) setCursor((c) => Math.max(0, c - 1))
		if (key.downArrow) setCursor((c) => Math.min(sensors.length - 1, c + 1))
		if (key.pageUp) setCursor((c) => Math.max(0, c - visible))
		if (key.pageDown) setCursor((c) => Math.min(sensors.length - 1, c + visible))
		if (input === 'g') setCursor(0)
		if (input === 'G') setCursor(sensors.length - 1)
	})

	if (error) return <Text color="red">Error: {error}</Text>
	if (!sensors) return <Spinner label="Loading sensors..." />
	if (sensors.length === 0) return <Text dimColor>No sensors found.</Text>

	const maxName = Math.max(5, ...sensors.map((s) => s.name.length))
	const nameWidth = Math.min(60, maxName)
	const slice = sensors.slice(start, end)
	const focused = sensors[cursor]

	return (
		<Box flexDirection="column">
			<Box>
				<Box width={2} />
				<Box width={nameWidth + 2}>
					<Text bold>SENSOR</Text>
				</Box>
				<Box width={12}>
					<Text bold>STATUS</Text>
				</Box>
				<Box flexGrow={1}>
					<Text bold>NEXT TICK</Text>
				</Box>
			</Box>
			{slice.map((s, sliceIdx) => {
				const i = start + sliceIdx
				const selected = i === cursor
				return (
					<Box key={s.name}>
						<Box width={2} flexShrink={0}>
							<Text color="cyan">{selected ? '›' : ' '}</Text>
						</Box>
						<Box width={nameWidth + 2} flexShrink={0}>
							<Text color={selected ? 'cyan' : undefined} wrap="truncate">
								{s.name}
							</Text>
						</Box>
						<Box width={12} flexShrink={0}>
							<Text color={statusColour(s.status)}>{s.status}</Text>
						</Box>
						<Box flexGrow={1}>
							<Text>{s.nextTick ? timeAgo(s.nextTick.timestamp) : '-'}</Text>
						</Box>
					</Box>
				)
			})}
			{sensors.length > visible && (
				<Text dimColor>
					{cursor + 1}/{sensors.length} {start > 0 ? '↑' : ' '}
					{end < sensors.length ? '↓' : ' '}
				</Text>
			)}

			{focused && focused.ticks.length > 0 && (
				<Box marginTop={1} flexDirection="column">
					<Text bold>Recent ticks: {focused.name}</Text>
					{focused.ticks.map((t, i) => {
						const errLine = t.error?.message?.split('\n')[0] ?? ''
						return (
							<Box key={`${t.timestamp}-${i}`}>
								<Box width={10} flexShrink={0}>
									<Text color={tickColour(t.status)}>{t.status}</Text>
								</Box>
								<Box width={14} flexShrink={0}>
									<Text>{timeAgo(t.timestamp)}</Text>
								</Box>
								{errLine && (
									<Box flexGrow={1}>
										<Text color="red" wrap="truncate">
											{errLine}
										</Text>
									</Box>
								)}
							</Box>
						)
					})}
				</Box>
			)}
		</Box>
	)
}
