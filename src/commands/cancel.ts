import { makeClient, terminateRun } from '../client/index.ts'

interface Opts {
	url: string
	auth?: string
	json: boolean
	id: string
}

export async function runCancel({ url, auth, json, id }: Opts): Promise<void> {
	const client = makeClient({ url, auth })
	const status = await terminateRun(client, id)
	if (json) {
		process.stdout.write(`${JSON.stringify({ runId: id, status }, null, 2)}\n`)
		return
	}
	process.stdout.write(`Cancelled run ${id} — status: ${status}\n`)
}
