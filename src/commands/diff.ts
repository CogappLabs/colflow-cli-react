import { fetchRun, makeClient, type RunEvent } from '../client/index.ts'
import { timeAgo, tsToSeconds } from '../format/index.ts'

interface Opts {
	url: string
	auth?: string
	json: boolean
	run1: string
	run2: string
}

interface StepSummary {
	stepKey: string
	hasError: boolean
}

function extractSteps(events: RunEvent[]): Map<string, StepSummary> {
	const out = new Map<string, StepSummary>()
	for (const e of events) {
		if (!e.stepKey) continue
		const cur = out.get(e.stepKey)
		if (!cur) out.set(e.stepKey, { stepKey: e.stepKey, hasError: e.level === 'ERROR' })
		else if (e.level === 'ERROR') cur.hasError = true
	}
	return out
}

function statusOf(s: StepSummary | undefined): string {
	if (!s) return 'MISSING'
	return s.hasError ? 'FAILED' : 'OK'
}

function durationStr(start: number | string | null, end: number | string | null): string {
	const a = tsToSeconds(start)
	const b = tsToSeconds(end)
	if (a == null || b == null) return 'unknown'
	const s = Math.max(0, b - a)
	if (s < 60) return `${s}s`
	return `${Math.floor(s / 60)}m ${s % 60}s`
}

export async function runDiff({ url, auth, json, run1, run2 }: Opts): Promise<void> {
	const client = makeClient({ url, auth })
	const [r1, r2] = await Promise.all([fetchRun(client, run1), fetchRun(client, run2)])
	const s1 = extractSteps(r1.events)
	const s2 = extractSteps(r2.events)
	const allKeys = new Set([...s1.keys(), ...s2.keys()])
	const diffs: { step: string; run1: string; run2: string }[] = []
	for (const k of allKeys) {
		const a = statusOf(s1.get(k))
		const b = statusOf(s2.get(k))
		if (a !== b) diffs.push({ step: k, run1: a, run2: b })
	}
	if (json) {
		process.stdout.write(
			`${JSON.stringify(
				{
					run1: {
						runId: r1.runId,
						status: r1.status,
						duration: durationStr(r1.startTime, r1.endTime),
						steps: (r1.stats?.stepsSucceeded ?? 0) + (r1.stats?.stepsFailed ?? 0),
					},
					run2: {
						runId: r2.runId,
						status: r2.status,
						duration: durationStr(r2.startTime, r2.endTime),
						steps: (r2.stats?.stepsSucceeded ?? 0) + (r2.stats?.stepsFailed ?? 0),
					},
					differences: diffs,
				},
				null,
				2,
			)}\n`,
		)
		return
	}
	const id1 = r1.runId.slice(0, 8)
	const id2 = r2.runId.slice(0, 8)
	process.stdout.write(`Run comparison\n\n`)
	const row = (label: string, a: string, b: string) =>
		process.stdout.write(`  ${label.padEnd(12)}  ${a.padEnd(20)}  ${b}\n`)
	row('', id1, id2)
	row('Status', r1.status, r2.status)
	row('Job', r1.jobName, r2.jobName)
	row('Duration', durationStr(r1.startTime, r1.endTime), durationStr(r2.startTime, r2.endTime))
	row('Started', timeAgo(r1.startTime), timeAgo(r2.startTime))
	row('Succeeded', String(r1.stats?.stepsSucceeded ?? 0), String(r2.stats?.stepsSucceeded ?? 0))
	row('Failed', String(r1.stats?.stepsFailed ?? 0), String(r2.stats?.stepsFailed ?? 0))
	process.stdout.write('\n')
	if (diffs.length === 0) {
		process.stdout.write('All steps match between runs\n')
		return
	}
	process.stdout.write(`${diffs.length} step(s) differ:\n\n`)
	const maxStep = Math.max(...diffs.map((d) => d.step.length))
	for (const d of diffs) {
		process.stdout.write(`  ${d.step.padEnd(maxStep)}  ${d.run1.padEnd(12)}  ${d.run2}\n`)
	}
}
