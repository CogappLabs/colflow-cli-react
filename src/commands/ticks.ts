import { fetchTicks, makeClient } from '../client/index.ts'
import { timeAgo } from '../format/index.ts'

interface Opts {
	url: string
	auth?: string
	json: boolean
	name: string
	limit?: number
}

export async function runTicks({ url, auth, json, name, limit }: Opts): Promise<void> {
	const client = makeClient({ url, auth })
	const state = await fetchTicks(client, name, limit ?? 20)
	if (json) {
		process.stdout.write(`${JSON.stringify(state, null, 2)}\n`)
		return
	}
	process.stdout.write(`${state.name} (${state.type}) — ${state.status}\n\n`)
	if (state.ticks.length === 0) {
		process.stdout.write('No ticks recorded\n')
		return
	}
	for (const t of state.ticks) {
		const runs = t.runIds.length > 0 ? `  runs: ${t.runIds.join(', ')}` : ''
		process.stdout.write(`  ${t.status.padEnd(8)} ${timeAgo(t.timestamp).padEnd(16)}${runs}\n`)
		if (t.skipReason) process.stdout.write(`           skipped: ${t.skipReason}\n`)
		if (t.error) process.stdout.write(`           ${t.error.message.split('\n')[0]}\n`)
	}
	const failures = state.ticks.filter((t) => t.status === 'FAILURE').length
	if (failures > 0) {
		process.stdout.write(`\n${failures} of ${state.ticks.length} recent ticks failed\n`)
	}
}
