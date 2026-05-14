import { fetchRun, makeClient } from '../client/index.ts'
import { formatTimestamp } from '../format/index.ts'

interface Opts {
	url: string
	auth?: string
	json: boolean
	id: string
}

export async function runRun({ url, auth, json, id }: Opts): Promise<void> {
	const client = makeClient({ url, auth })
	const r = await fetchRun(client, id)
	if (json) {
		process.stdout.write(`${JSON.stringify(r, null, 2)}\n`)
		return
	}
	process.stdout.write(`Run    ${r.runId}\n`)
	process.stdout.write(`Job    ${r.jobName}\n`)
	process.stdout.write(`Status ${r.status}\n`)
	process.stdout.write(`Start  ${formatTimestamp(r.startTime)}\n`)
	process.stdout.write(`End    ${formatTimestamp(r.endTime)}\n`)
	if (r.stats) {
		process.stdout.write(`Steps  ${r.stats.stepsSucceeded} ok, ${r.stats.stepsFailed} failed\n`)
	}
}
