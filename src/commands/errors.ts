import { fetchRunErrors, makeClient } from '../client/index.ts'
import { formatMetadataEntry } from '../format/index.ts'

interface Opts {
	url: string
	auth?: string
	json: boolean
	id: string
}

export async function runErrors({ url, auth, json, id }: Opts): Promise<void> {
	const client = makeClient({ url, auth })
	const { failures, failedChecks } = await fetchRunErrors(client, id)
	if (json) {
		process.stdout.write(`${JSON.stringify({ failures, failedChecks }, null, 2)}\n`)
		return
	}
	if (failures.length === 0 && failedChecks.length === 0) {
		process.stdout.write('No step failures or failed checks.\n')
		return
	}
	for (const f of failures) {
		process.stdout.write(`\n[${f.stepKey}]\n`)
		process.stdout.write(`  ${f.error.message}\n`)
		for (const c of f.error.causes ?? []) {
			process.stdout.write(`  cause: ${c.message}\n`)
		}
		if (f.error.stack) {
			process.stdout.write(`${f.error.stack}\n`)
		}
	}
	for (const c of failedChecks) {
		process.stdout.write(`\n[check ${c.assetKey.join('/')}:${c.checkName}] ${c.severity}\n`)
		for (const m of c.metadataEntries) {
			process.stdout.write(`${formatMetadataEntry(m, '  ')}\n`)
		}
	}
}
