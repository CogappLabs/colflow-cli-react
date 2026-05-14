import { Spinner } from '@inkjs/ui'
import { Box, Text, useInput } from 'ink'
import { useEffect, useRef, useState } from 'react'
import {
	fetchRunSteps,
	makeClient,
	type Run,
	type RunStep,
	terminateRun,
} from '../../client/index.ts'
import { formatTimestamp, statusColour, tsToSeconds } from '../../format/index.ts'
import { type Column, Table } from '../components/Table.tsx'
import { t } from '../i18n/en.ts'
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

function checksCell(s: RunStep): { text: string; colour?: string; dim?: boolean } {
	if (s.failedChecks.length > 0) {
		return {
			text: `✗ ${s.failedChecks.length} failed: ${s.failedChecks.join(', ')}`,
			colour: 'red',
		}
	}
	if (s.warnedChecks.length > 0) {
		return {
			text: `⚠ ${s.warnedChecks.length} warn: ${s.warnedChecks.join(', ')}`,
			colour: 'yellow',
		}
	}
	if (s.passedCheckCount > 0) {
		return { text: `✓ ${s.passedCheckCount} ok`, colour: 'green' }
	}
	return { text: '-', dim: true }
}

type CancelPhase =
	| { kind: 'idle' }
	| { kind: 'confirm' }
	| { kind: 'cancelling' }
	| { kind: 'cancelled'; status: string }
	| { kind: 'error'; message: string }

const NON_TERMINAL = new Set(['STARTED', 'STARTING', 'QUEUED'])

export function RunDetail({ url, auth, run, onBack, onSelectStep }: Props) {
	const [steps, setSteps] = useState<RunStep[] | null>(null)
	const [error, setError] = useState<string | null>(null)
	const [cursor, setCursor] = useState(0)
	const [cancelPhase, setCancelPhase] = useState<CancelPhase>({ kind: 'idle' })
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
		if (cancelPhase.kind === 'cancelling') return
		if (cancelPhase.kind === 'confirm') {
			if (input === 'y' || key.return) {
				setCancelPhase({ kind: 'cancelling' })
				const client = makeClient({ url, auth })
				terminateRun(client, run.runId)
					.then((status) => setCancelPhase({ kind: 'cancelled', status }))
					.catch((e: Error) => setCancelPhase({ kind: 'error', message: String(e?.message ?? e) }))
				return
			}
			if (input === 'n' || key.escape) setCancelPhase({ kind: 'idle' })
			return
		}
		if ((cancelPhase.kind === 'cancelled' || cancelPhase.kind === 'error') && key.return) {
			setCancelPhase({ kind: 'idle' })
			return
		}
		if (input === 'q' || key.escape || key.leftArrow) {
			onBack()
			return
		}
		if (input === 'x' && NON_TERMINAL.has(run.status)) {
			setCancelPhase({ kind: 'confirm' })
			return
		}
		if (!steps || steps.length === 0) return
		if (key.upArrow) setCursor((c) => (c <= 0 ? steps.length - 1 : c - 1))
		if (key.downArrow) setCursor((c) => (c >= steps.length - 1 ? 0 : c + 1))
		if (key.pageUp) setCursor((c) => Math.max(0, c - visible))
		if (key.pageDown) setCursor((c) => Math.min(steps.length - 1, c + visible))
		if (input === 'g') setCursor(0)
		if (input === 'G') setCursor(steps.length - 1)
		if (key.return) {
			const s = steps[cursor]
			if (s) onSelectStep(s)
		}
	})

	const maxAssetLen = steps ? Math.max(5, ...steps.map((s) => renderAssetKey(s).length)) : 5
	const assetWidth = Math.min(60, maxAssetLen)
	// Reserve: shell(4) + run header(2) + section title(1) + table header(1) + scroll hint(1) + margins(3)
	const { start, end, visible } = useViewportWindow(steps?.length ?? 0, cursor, 12)

	const columns: Column<RunStep>[] = [
		{
			header: t.run.stepHeader.status,
			width: 14,
			render: (s) => ({ text: s.status, colour: stepStatusColour(s.status) }),
		},
		{
			header: t.run.stepHeader.asset,
			width: assetWidth,
			render: (s) => ({ text: renderAssetKey(s) }),
		},
		{
			header: t.run.stepHeader.time,
			width: 6,
			render: (s) => ({ text: duration(s.startTime, s.endTime) }),
		},
		{
			header: t.run.stepHeader.checks,
			flex: true,
			render: (s) => checksCell(s),
		},
	]

	return (
		<Box flexDirection="column">
			<Box flexDirection="column">
				<Text>
					<Text bold>{t.run.statusLabel}</Text>{' '}
					<Text color={statusColour(run.status)}>{run.status}</Text>
					{'   '}
					{formatTimestamp(run.startTime)} → {formatTimestamp(run.endTime)}
				</Text>
			</Box>

			{cancelPhase.kind === 'confirm' && (
				<Box marginTop={1} flexDirection="column">
					<Text color="yellow">{t.run.cancelConfirm(run.runId.slice(0, 8))}</Text>
					<Text>
						<Text color="green">y</Text> confirm · <Text color="red">n</Text> cancel
					</Text>
				</Box>
			)}
			{cancelPhase.kind === 'cancelling' && (
				<Box marginTop={1}>
					<Text color="cyan">{t.run.cancelling}</Text>
				</Box>
			)}
			{cancelPhase.kind === 'cancelled' && (
				<Box marginTop={1} flexDirection="column">
					<Text color="yellow">{t.run.cancelled(cancelPhase.status)}</Text>
					<Text dimColor>{t.common.dismissHint}</Text>
				</Box>
			)}
			{cancelPhase.kind === 'error' && (
				<Box marginTop={1} flexDirection="column">
					<Text color="red">{t.run.cancelFailed(cancelPhase.message)}</Text>
					<Text dimColor>{t.common.dismissHint}</Text>
				</Box>
			)}

			<Box marginTop={1} flexDirection="column">
				<Text bold>{t.run.assetsHeader}</Text>
				{error ? (
					<Text color="red">
						{t.common.errorPrefix} {error}
					</Text>
				) : !steps ? (
					<Spinner label={t.common.loading} />
				) : steps.length === 0 ? (
					<Text dimColor>{t.run.empty}</Text>
				) : (
					<Table
						columns={columns}
						data={steps}
						cursor={cursor}
						viewport={{ start, end, visible, total: steps.length }}
					/>
				)}
			</Box>
		</Box>
	)
}
