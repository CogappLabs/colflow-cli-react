import type { RunDetail, RunEvent } from '../client/index.ts'
import { tsToSeconds } from '../format/index.ts'

export interface StepSummary {
	stepKey: string
	hasError: boolean
}

export function extractSteps(events: RunEvent[]): Map<string, StepSummary> {
	const out = new Map<string, StepSummary>()
	for (const e of events) {
		if (!e.stepKey) continue
		const cur = out.get(e.stepKey)
		if (!cur) out.set(e.stepKey, { stepKey: e.stepKey, hasError: e.level === 'ERROR' })
		else if (e.level === 'ERROR') cur.hasError = true
	}
	return out
}

export function statusOf(s: StepSummary | undefined): 'OK' | 'FAILED' | 'MISSING' {
	if (!s) return 'MISSING'
	return s.hasError ? 'FAILED' : 'OK'
}

export function durationStr(
	start: number | string | null,
	end: number | string | null,
): string {
	const a = tsToSeconds(start)
	const b = tsToSeconds(end)
	if (a == null || b == null) return 'unknown'
	const s = Math.max(0, b - a)
	if (s < 60) return `${s}s`
	return `${Math.floor(s / 60)}m ${s % 60}s`
}

export interface DiffRow {
	step: string
	left: 'OK' | 'FAILED' | 'MISSING'
	right: 'OK' | 'FAILED' | 'MISSING'
}

export function computeDiff(a: RunDetail, b: RunDetail): DiffRow[] {
	const sa = extractSteps(a.events)
	const sb = extractSteps(b.events)
	const all = new Set([...sa.keys(), ...sb.keys()])
	const out: DiffRow[] = []
	for (const k of all) {
		const left = statusOf(sa.get(k))
		const right = statusOf(sb.get(k))
		if (left !== right) out.push({ step: k, left, right })
	}
	out.sort((x, y) => x.step.localeCompare(y.step))
	return out
}
