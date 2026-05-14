import { fetchRun, makeClient, type RunEvent } from '../client/index.ts'
import { timeAgo } from '../format/index.ts'

interface Opts {
	url: string
	auth?: string
	json: boolean
	id: string
	interval?: number
}

const TERMINAL = new Set(['SUCCESS', 'FAILURE', 'CANCELED'])

const colourCode: Record<string, string> = {
	red: '\x1b[31m',
	yellow: '\x1b[33m',
	cyan: '\x1b[36m',
	gray: '\x1b[90m',
	green: '\x1b[32m',
}
const reset = '\x1b[0m'
function colour(text: string, name: keyof typeof colourCode | null): string {
	if (!process.stdout.isTTY || !name) return text
	return `${colourCode[name]}${text}${reset}`
}

function levelColour(level: string): keyof typeof colourCode | null {
	if (level === 'ERROR') return 'red'
	if (level === 'WARNING') return 'yellow'
	return 'gray'
}

function emitEvent(e: RunEvent, runId: string, asJson: boolean) {
	if (asJson) {
		process.stdout.write(
			`${JSON.stringify({
				type: 'event',
				run_id: runId,
				level: e.level,
				step_key: e.stepKey,
				message: e.message,
				timestamp: e.timestamp,
			})}\n`,
		)
		return
	}
	const step = e.stepKey ? colour(`[${e.stepKey}]`, 'cyan') : ''
	const lvl = colour(e.level.padEnd(7), levelColour(e.level))
	process.stdout.write(`${lvl} ${step} ${e.message}\n`)
}

function sleep(ms: number, signal: AbortSignal): Promise<void> {
	return new Promise((resolve) => {
		const id = setTimeout(resolve, ms)
		signal.addEventListener('abort', () => {
			clearTimeout(id)
			resolve()
		})
	})
}

export async function runTail({ url, auth, json, id, interval }: Opts): Promise<void> {
	const client = makeClient({ url, auth })
	const ac = new AbortController()
	process.on('SIGINT', () => ac.abort())
	process.on('SIGTERM', () => ac.abort())

	if (!json && process.stdout.isTTY) {
		process.stderr.write(colour(`Tailing run ${id} (Ctrl+C to stop)...\n\n`, 'gray'))
	}

	const intervalMs = (interval ?? 3) * 1000
	let seen = 0

	while (!ac.signal.aborted) {
		const d = await fetchRun(client, id)
		const events = d.events.filter((e) => e.message)
		for (const e of events.slice(seen)) emitEvent(e, id, json)
		seen = events.length

		if (TERMINAL.has(d.status)) {
			if (json) {
				process.stdout.write(
					`${JSON.stringify({
						type: 'terminal',
						run_id: id,
						status: d.status,
						steps_succeeded: d.stats?.stepsSucceeded ?? 0,
						steps_failed: d.stats?.stepsFailed ?? 0,
						start_time: d.startTime,
					})}\n`,
				)
			} else {
				const c = d.status === 'SUCCESS' ? 'green' : d.status === 'FAILURE' ? 'red' : 'yellow'
				process.stdout.write(
					`\nRun ${colour(d.status, c)} — ${d.stats?.stepsSucceeded ?? 0} ok, ${
						d.stats?.stepsFailed ?? 0
					} failed (${timeAgo(d.startTime)})\n`,
				)
			}
			return
		}
		await sleep(intervalMs, ac.signal)
	}
}
