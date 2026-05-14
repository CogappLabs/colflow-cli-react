import { fetchRun, makeClient } from '../client/index.ts'
import { formatTimestamp } from '../format/index.ts'

interface Opts {
	url: string
	auth?: string
	json: boolean
	id: string
	step?: string
	level?: string
}

export async function runLogs({ url, auth, json, id, step, level }: Opts): Promise<void> {
	const client = makeClient({ url, auth })
	const r = await fetchRun(client, id)
	const events = r.events.filter((e) => {
		if (step && e.stepKey !== step) return false
		if (level && e.level !== level.toUpperCase()) return false
		return true
	})
	if (json) {
		process.stdout.write(`${JSON.stringify(events, null, 2)}\n`)
		return
	}
	for (const e of events) {
		const stepTag = e.stepKey ? ` [${e.stepKey}]` : ''
		process.stdout.write(
			`${formatTimestamp(e.timestamp)} ${e.level.padEnd(7)}${stepTag} ${e.message}\n`,
		)
	}
}
