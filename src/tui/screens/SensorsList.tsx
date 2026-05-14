import { Spinner } from '@inkjs/ui'
import { Box, Text, useInput } from 'ink'
import { useEffect, useState } from 'react'
import { fetchSensors, makeClient, type SensorState } from '../../client/index.ts'
import { timeAgo } from '../../format/index.ts'
import { type Column, Table } from '../components/Table.tsx'
import { t } from '../i18n/en.ts'
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
		if (key.upArrow) setCursor((c) => (c <= 0 ? sensors.length - 1 : c - 1))
		if (key.downArrow) setCursor((c) => (c >= sensors.length - 1 ? 0 : c + 1))
		if (key.pageUp) setCursor((c) => Math.max(0, c - visible))
		if (key.pageDown) setCursor((c) => Math.min(sensors.length - 1, c + visible))
		if (input === 'g') setCursor(0)
		if (input === 'G') setCursor(sensors.length - 1)
	})

	if (error)
		return (
			<Text color="red">
				{t.common.errorPrefix} {error}
			</Text>
		)
	if (!sensors) return <Spinner label={t.common.loading} />
	if (sensors.length === 0) return <Text dimColor>{t.sensors.empty}</Text>

	const maxName = Math.max(5, ...sensors.map((s) => s.name.length))
	const nameWidth = Math.min(60, maxName)

	const columns: Column<SensorState>[] = [
		{
			header: t.sensors.header.sensor,
			width: nameWidth,
			render: (s) => ({ text: s.name }),
		},
		{
			header: t.sensors.header.status,
			width: 10,
			render: (s) => ({ text: s.status, colour: statusColour(s.status) }),
		},
		{
			header: t.sensors.header.nextTick,
			flex: true,
			render: (s) => ({ text: s.nextTick ? timeAgo(s.nextTick.timestamp) : '-' }),
		},
	]

	const focused = sensors[cursor]

	return (
		<Box flexDirection="column">
			<Table
				columns={columns}
				data={sensors}
				cursor={cursor}
				viewport={{ start, end, visible, total: sensors.length }}
			/>

			{focused && focused.ticks.length > 0 && (
				<Box marginTop={1} flexDirection="column">
					<Text bold>{t.sensors.recentTicks(focused.name)}</Text>
					{focused.ticks.map((tick) => {
						const errLine = tick.error?.message?.split('\n')[0] ?? ''
						return (
							<Box key={`${tick.timestamp}-${tick.status}`}>
								<Box width={10} flexShrink={0}>
									<Text color={tickColour(tick.status)}>{tick.status}</Text>
								</Box>
								<Box width={14} flexShrink={0}>
									<Text>{timeAgo(tick.timestamp)}</Text>
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
