import { fetchSchedules, makeClient } from '../client/index.ts'
import { timeAgo } from '../format/index.ts'

interface Opts {
	url: string
	auth?: string
	json: boolean
}

export async function runSchedules({ url, auth, json }: Opts): Promise<void> {
	const client = makeClient({ url, auth })
	const schedules = await fetchSchedules(client)
	if (json) {
		process.stdout.write(`${JSON.stringify(schedules, null, 2)}\n`)
		return
	}
	if (schedules.length === 0) {
		process.stdout.write('No schedules found\n')
		return
	}
	for (const s of schedules) {
		process.stdout.write(`${s.name.padEnd(40)} ${s.status.padEnd(8)} ${s.cronSchedule}\n`)
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
