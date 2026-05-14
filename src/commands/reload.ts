import { makeClient, reloadLocation } from '../client/index.ts'

interface Opts {
	url: string
	auth?: string
	json: boolean
}

export async function runReload({ url, auth, json }: Opts): Promise<void> {
	const client = makeClient({ url, auth })
	const r = await reloadLocation(client)
	if (json) {
		process.stdout.write(`${JSON.stringify(r, null, 2)}\n`)
		return
	}
	if (r.status === 'LOADED') {
		process.stdout.write('Code location reloaded successfully\n')
	} else if (r.status === 'ERROR') {
		process.stderr.write(`Reload failed: ${r.message}\n`)
		process.exit(1)
	} else {
		process.stdout.write(`Reload status: ${r.status}\n`)
		if (r.message) process.stdout.write(`  ${r.message}\n`)
	}
}
