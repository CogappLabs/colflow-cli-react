import { fetchRuns, makeClient } from '../client/index.ts'

interface Opts {
	url: string
	auth?: string
	json: boolean
}

export async function runStatus({ url, auth, json }: Opts): Promise<void> {
	const client = makeClient({ url, auth })
	const runs = await fetchRuns(client, 5)
	if (json) {
		process.stdout.write(`${JSON.stringify(runs, null, 2)}\n`)
		return
	}
	for (const r of runs) {
		process.stdout.write(`${r.status.padEnd(10)} ${r.jobName}\t${r.runId}\n`)
	}
}
