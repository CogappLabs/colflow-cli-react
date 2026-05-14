import { fetchRunErrors, makeClient } from '../client/index.ts'

interface Opts {
	url: string
	auth?: string
	json: boolean
	id: string
}

export async function runErrors({ url, auth, json, id }: Opts): Promise<void> {
	const client = makeClient({ url, auth })
	const failures = await fetchRunErrors(client, id)
	if (json) {
		process.stdout.write(`${JSON.stringify(failures, null, 2)}\n`)
		return
	}
	if (failures.length === 0) {
		process.stdout.write('No step failures.\n')
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
}
