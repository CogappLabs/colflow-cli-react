import { fetchAssetChecks, makeClient } from '../client/index.ts'
import { formatMetadataEntry, formatTimestamp } from '../format/index.ts'

interface Opts {
	url: string
	auth?: string
	json: boolean
	key: string
	check?: string
	limit?: number
}

export async function runChecks({ url, auth, json, key, check, limit }: Opts): Promise<void> {
	const client = makeClient({ url, auth })
	const checks = await fetchAssetChecks(client, key.split('/'), limit ?? 1, check)
	if (!checks) {
		process.stderr.write(`Asset not found: ${key}\n`)
		process.exit(1)
	}
	if (json) {
		process.stdout.write(`${JSON.stringify(checks, null, 2)}\n`)
		return
	}
	if (checks.length === 0) {
		process.stdout.write(check ? `No check named ${check} on ${key}.\n` : `No checks on ${key}.\n`)
		return
	}
	for (const c of checks) {
		process.stdout.write(`\n${c.name}${c.blocking ? ' (blocking)' : ''}\n`)
		if (c.executions.length === 0) process.stdout.write('  never run\n')
		for (const e of c.executions) {
			process.stdout.write(`  ${e.status}  run ${e.runId}  ${formatTimestamp(e.timestamp)}\n`)
			for (const m of e.metadataEntries) {
				process.stdout.write(`${formatMetadataEntry(m, '    ')}\n`)
			}
		}
	}
}
