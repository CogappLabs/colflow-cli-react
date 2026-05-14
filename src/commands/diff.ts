import { fetchRun, makeClient } from '../client/index.ts'
import { computeDiff, durationStr, extractSteps, statusOf } from '../diff/index.ts'
import { timeAgo } from '../format/index.ts'

interface Opts {
	url: string
	auth?: string
	json: boolean
	run1: string
	run2: string
}

export async function runDiff({ url, auth, json, run1, run2 }: Opts): Promise<void> {
	const client = makeClient({ url, auth })
	const [r1, r2] = await Promise.all([fetchRun(client, run1), fetchRun(client, run2)])
	const diffRows = computeDiff(r1, r2)
	const diffs = diffRows.map((d) => ({ step: d.step, run1: d.left, run2: d.right }))
	void extractSteps
	void statusOf
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
