import { fetchJobConfig, makeClient } from '../client/index.ts'

interface Opts {
	url: string
	auth?: string
	json: boolean
	job: string
}

export async function runConfig({ url, auth, json, job }: Opts): Promise<void> {
	const client = makeClient({ url, auth })
	const cfg = await fetchJobConfig(client, job)
	if (json) {
		process.stdout.write(`${JSON.stringify(cfg, null, 2)}\n`)
		return
	}
	process.stdout.write(`Config schema for ${cfg.jobName}\n\n`)
	if (cfg.fields.length === 0) {
		process.stdout.write('No config fields\n')
		return
	}
	const maxName = Math.max(...cfg.fields.map((f) => f.name.length))
	for (const f of cfg.fields) {
		const required = f.isRequired ? 'required' : 'optional'
		const def = f.defaultValueAsJson ? ` = ${f.defaultValueAsJson}` : ''
		process.stdout.write(
			`  ${f.name.padEnd(maxName)}  ${f.configTypeKey}  ${required}${def}\n`,
		)
		if (f.description) {
			process.stdout.write(`  ${' '.repeat(maxName)}  ${f.description}\n`)
		}
	}
}
