import { fetchRuns, makeClient } from '../client/index.ts'
import { formatTimestamp, statusColour } from '../format/index.ts'

interface Opts {
	url: string
	auth?: string
	json: boolean
	limit?: number
	status?: string
}

const colourCode: Record<string, string> = {
	green: '\x1b[32m',
	red: '\x1b[31m',
	yellow: '\x1b[33m',
	cyan: '\x1b[36m',
	gray: '\x1b[90m',
}
const reset = '\x1b[0m'

function colour(text: string, name: string): string {
	if (!process.stdout.isTTY) return text
	const code = colourCode[name]
	return code ? `${code}${text}${reset}` : text
}

export async function runRuns({ url, auth, json, limit, status }: Opts): Promise<void> {
	const client = makeClient({ url, auth })
	const statuses = status ? [status.toUpperCase()] : undefined
	const runs = await fetchRuns(client, limit ?? 25, statuses)
	if (json) {
		process.stdout.write(`${JSON.stringify(runs, null, 2)}\n`)
		return
	}
	for (const r of runs) {
		const s = colour(r.status.padEnd(10), statusColour(r.status))
		process.stdout.write(
			`${s} ${r.jobName.padEnd(26)} ${formatTimestamp(r.startTime)}  ${r.runId}\n`,
		)
	}
}
