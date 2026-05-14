import { TextInput } from '@inkjs/ui'
import { useScreenSize } from 'fullscreen-ink'
import { Box, Text, useInput } from 'ink'
import { useEffect, useState } from 'react'
import { fetchRun, makeClient, type RunEvent } from '../../client/index.ts'

interface Props {
	url: string
	auth?: string
	runId: string
	onBack: () => void
}

const TERMINAL = new Set(['SUCCESS', 'FAILURE', 'CANCELED'])

function levelColour(level: string): string | undefined {
	if (level === 'ERROR') return 'red'
	if (level === 'WARNING') return 'yellow'
	return undefined
}

export function Tail({ url, auth, runId, onBack }: Props) {
	const [events, setEvents] = useState<RunEvent[]>([])
	const [frozen, setFrozen] = useState<RunEvent[] | null>(null)
	const [status, setStatus] = useState<string>('STARTED')
	const [paused, setPaused] = useState(false)
	const [filterInput, setFilterInput] = useState(false)
	const [filter, setFilter] = useState('')
	const [scrollOffset, setScrollOffset] = useState(0)
	const [error, setError] = useState<string | null>(null)

	useEffect(() => {
		const client = makeClient({ url, auth })
		let cancelled = false
		let timer: ReturnType<typeof setTimeout> | null = null
		let consecutiveErrors = 0
		const poll = async () => {
			if (cancelled) return
			try {
				const d = await fetchRun(client, runId)
				if (cancelled) return
				consecutiveErrors = 0
				setError(null)
				// Always update underlying state. Pause only freezes scroll position.
				setEvents(d.events.filter((e) => e.message))
				setStatus(d.status)
				if (TERMINAL.has(d.status)) return
			} catch (e: unknown) {
				if (cancelled) return
				consecutiveErrors++
				setError(`${String((e as Error)?.message ?? e)} (retry ${consecutiveErrors})`)
				if (consecutiveErrors >= 5) return
			}
			const delay = Math.min(30_000, 3000 * 2 ** Math.max(0, consecutiveErrors - 1))
			timer = setTimeout(poll, delay)
		}
		poll()
		return () => {
			cancelled = true
			if (timer) clearTimeout(timer)
		}
	}, [url, auth, runId])

	useInput((input, key) => {
		if (filterInput) return
		if (input === 'q' || key.escape) {
			onBack()
			return
		}
		if (input === ' ') {
			setPaused((p) => {
				if (!p) setFrozen(events)
				else setFrozen(null)
				return !p
			})
		}
		if (input === '/') {
			setFilterInput(true)
			return
		}
		if (input === 'c') setFilter('')
		if (key.upArrow) setScrollOffset((o) => o + 1)
		if (key.downArrow) setScrollOffset((o) => Math.max(0, o - 1))
		if (key.pageUp) setScrollOffset((o) => o + 10)
		if (key.pageDown) setScrollOffset((o) => Math.max(0, o - 10))
		if (input === 'G') setScrollOffset(0)
	})

	const source = paused && frozen ? frozen : events
	const filtered = filter
		? source.filter(
				(e) =>
					e.message.toLowerCase().includes(filter.toLowerCase()) ||
					(e.stepKey ?? '').toLowerCase().includes(filter.toLowerCase()),
			)
		: events

	const { height } = useScreenSize()
	// Reserve: shell header (2) + footer (2) + status row (1) + filter prompt (2) + margins (2)
	const visibleRows = Math.max(5, height - 9)
	const end = Math.max(0, filtered.length - scrollOffset)
	const start = Math.max(0, end - visibleRows)
	const slice = filtered.slice(start, end)

	return (
		<Box flexDirection="column">
			<Box>
				<Text color={status === 'FAILURE' ? 'red' : status === 'SUCCESS' ? 'green' : 'cyan'}>
					[{status}]
				</Text>
				{paused && <Text color="yellow"> PAUSED</Text>}
				{filter && <Text dimColor> filter:&quot;{filter}&quot;</Text>}
			</Box>
			<Box flexDirection="column" marginTop={1} flexGrow={1}>
				{error ? (
					<Text color="red">Error: {error}</Text>
				) : slice.length === 0 ? (
					<Text dimColor>Waiting for events...</Text>
				) : (
					slice.map((e, i) => (
						<Box key={`${start + i}-${e.timestamp}`}>
							<Box width={9}>
								<Text color={levelColour(e.level)}>{e.level}</Text>
							</Box>
							{e.stepKey && (
								<Box width={28}>
									<Text color="cyan">[{e.stepKey}]</Text>
								</Box>
							)}
							<Text>{e.message}</Text>
						</Box>
					))
				)}
			</Box>
			<Box marginTop={1}>
				{filterInput ? (
					<Box>
						<Text>/</Text>
						<TextInput
							defaultValue={filter}
							onSubmit={(v) => {
								setFilter(v)
								setFilterInput(false)
							}}
						/>
					</Box>
				) : (
					<Text dimColor>space pause · / filter · c clear · ↑/↓ scroll · G bottom · q back</Text>
				)}
			</Box>
		</Box>
	)
}
