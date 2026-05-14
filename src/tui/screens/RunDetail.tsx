import { Spinner } from '@inkjs/ui'
import { Box, Text, useInput } from 'ink'
import { useEffect, useRef, useState } from 'react'
import { fetchRunSteps, makeClient, type Run, type RunStep } from '../../client/index.ts'
import { formatTimestamp, statusColour, tsToSeconds } from '../../format/index.ts'
import { useViewportWindow } from '../useViewport.ts'

interface Props {
	url: string
	auth?: string
	run: Run
	onBack: () => void
	onSelectStep: (step: RunStep) => void
}

function stepStatusColour(status: RunStep['status']) {
	switch (status) {
		case 'SUCCESS':
			return 'green'
		case 'FAILURE':
			return 'red'
		case 'STARTED':
			return 'cyan'
		case 'SKIPPED':
		case 'UPSTREAM_FAILED':
			return 'yellow'
		default:
			return 'gray'
	}
}

function duration(start: number | null, end: number | null): string {
	const a = tsToSeconds(start)
	const b = tsToSeconds(end)
	if (a == null || b == null) return '-'
	const s = Math.max(0, b - a)
	if (s < 60) return `${s}s`
	const m = Math.floor(s / 60)
	const rs = s % 60
	return `${m}m${rs}s`
}

function renderAssetKey(step: RunStep): string {
	if (step.assetKey && step.assetKey.length > 0) return step.assetKey.join('/')
	return step.stepKey
}

export function RunDetail({ url, auth, run, onBack, onSelectStep }: Props) {
	const [steps, setSteps] = useState<RunStep[] | null>(null)
	const [error, setError] = useState<string | null>(null)
	const [cursor, setCursor] = useState(0)
	const cursorPositioned = useRef(false)

	useEffect(() => {
		if (!steps || cursorPositioned.current) return
		const failedCheckIdx = steps.findIndex((s) => s.failedChecks.length > 0)
		const failedStepIdx = steps.findIndex((s) => s.status === 'FAILURE')
		const idx = failedCheckIdx >= 0 ? failedCheckIdx : failedStepIdx
		if (idx >= 0) setCursor(idx)
		cursorPositioned.current = true
	}, [steps])

	useEffect(() => {
		const client = makeClient({ url, auth })
		let cancelled = false
		let timer: ReturnType<typeof setTimeout> | null = null
		const TERMINAL = new Set(['SUCCESS', 'FAILURE', 'CANCELED'])
		const tick = async () => {
			try {
				const s = await fetchRunSteps(client, run.runId)
				if (cancelled) return
				setSteps(s)
				setError(null)
				if (TERMINAL.has(run.status)) return
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
	}, [url, auth, run.runId, run.status])

	useInput((input, key) => {
		if (input === 'q' || key.escape || key.leftArrow) {
			onBack()
			return
		}
		if (!steps || steps.length === 0) return
		if (key.upArrow) setCursor((c) => Math.max(0, c - 1))
		if (key.downArrow) setCursor((c) => Math.min(steps.length - 1, c + 1))
		if (key.pageUp) setCursor((c) => Math.max(0, c - visible))
		if (key.pageDown) setCursor((c) => Math.min(steps.length - 1, c + visible))
		if (input === 'g') setCursor(0)
		if (input === 'G') setCursor(steps.length - 1)
		if (key.return) {
			const s = steps[cursor]
			if (s) onSelectStep(s)
		}
	})

	const maxAssetLen = steps
		? Math.max(5, ...steps.map((s) => renderAssetKey(s).length))
		: 5
	const assetWidth = Math.min(60, maxAssetLen)
	// Reserve: shell(4) + run header(2) + section title(1) + table header(1) + scroll hint(1) + margins(3)
	const { start, end, visible } = useViewportWindow(steps?.length ?? 0, cursor, 12)
	const slice = steps ? steps.slice(start, end) : []

	function renderChecks(s: RunStep): React.ReactNode {
		if (s.failedChecks.length > 0) {
			return (
				<Text color="red">
					✗ {s.failedChecks.length} failed: {s.failedChecks.join(', ')}
				</Text>
			)
		}
		if (s.warnedChecks.length > 0) {
			return (
				<Text color="yellow">
					⚠ {s.warnedChecks.length} warn: {s.warnedChecks.join(', ')}
				</Text>
			)
		}
		if (s.passedCheckCount > 0) {
			return <Text color="green">✓ {s.passedCheckCount} ok</Text>
		}
		return <Text dimColor>-</Text>
	}

	return (
		<Box flexDirection="column">
			<Box flexDirection="column">
				<Text>
					<Text bold>Status:</Text>{' '}
					<Text color={statusColour(run.status)}>{run.status}</Text>
					{'   '}
					{formatTimestamp(run.startTime)} → {formatTimestamp(run.endTime)}
				</Text>
			</Box>

			<Box marginTop={1} flexDirection="column">
				<Text bold>Assets / steps</Text>
				{error ? (
					<Text color="red">Error: {error}</Text>
				) : !steps ? (
					<Spinner label="Loading steps..." />
				) : steps.length === 0 ? (
					<Text dimColor>No steps recorded.</Text>
				) : (
					<Box flexDirection="column">
						<Box>
							<Box width={2} />
							<Box width={16}>
								<Text bold>STATUS</Text>
							</Box>
							<Box width={assetWidth + 2}>
								<Text bold>ASSET</Text>
							</Box>
							<Box width={8}>
								<Text bold>TIME</Text>
							</Box>
							<Box flexGrow={1}>
								<Text bold>CHECKS</Text>
							</Box>
						</Box>
						{slice.map((s, sliceIdx) => {
							const i = start + sliceIdx
							const selected = i === cursor
							return (
								<Box key={s.stepKey}>
									<Box width={2} flexShrink={0}>
										<Text color="cyan">{selected ? '›' : ' '}</Text>
									</Box>
									<Box width={16} flexShrink={0}>
										<Text color={stepStatusColour(s.status)}>{s.status}</Text>
									</Box>
									<Box width={assetWidth + 2} flexShrink={0}>
										<Text color={selected ? 'cyan' : undefined} wrap="truncate">
											{renderAssetKey(s)}
										</Text>
									</Box>
									<Box width={8} flexShrink={0}>
										<Text>{duration(s.startTime, s.endTime)}</Text>
									</Box>
									<Box flexGrow={1}>{renderChecks(s)}</Box>
								</Box>
							)
						})}
						{steps && steps.length > visible && (
							<Text dimColor>
								{cursor + 1}/{steps.length} {start > 0 ? '↑' : ' '}
								{end < steps.length ? '↓' : ' '}
							</Text>
						)}
					</Box>
				)}
			</Box>

		</Box>
	)
}
