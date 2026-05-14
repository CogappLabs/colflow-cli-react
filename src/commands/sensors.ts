import { fetchSensors, makeClient } from '../client/index.ts'
import { timeAgo } from '../format/index.ts'

interface Opts {
	url: string
	auth?: string
	json: boolean
}

export async function runSensors({ url, auth, json }: Opts): Promise<void> {
	const client = makeClient({ url, auth })
	const sensors = await fetchSensors(client)
	if (json) {
		process.stdout.write(`${JSON.stringify(sensors, null, 2)}\n`)
		return
	}
	if (sensors.length === 0) {
		process.stdout.write('No sensors found\n')
		return
	}
	for (const s of sensors) {
		process.stdout.write(`${s.name.padEnd(50)} ${s.status}\n`)
		if (s.nextTick) {
			process.stdout.write(`  Next tick: ${timeAgo(s.nextTick.timestamp)}\n`)
		}
		for (const t of s.ticks) {
			const err = t.error ? ` — ${t.error.message.split('\n')[0]}` : ''
			process.stdout.write(`  ${t.status} ${timeAgo(t.timestamp)}${err}\n`)
		}
		process.stdout.write('\n')
	}
}
