import { launchRun, makeClient } from '../client/index.ts'
import { resolveRunConfig } from './_runconfig.ts'

interface Opts {
	url: string
	auth?: string
	json: boolean
	job: string
	config?: string[]
	configJson?: string
}

export async function runLaunch({ url, auth, json, job, config, configJson }: Opts): Promise<void> {
	if (!job) {
		process.stderr.write('Provide a job name.\n')
		process.exit(2)
	}
	const runConfig = resolveRunConfig({ config, configJson })
	const client = makeClient({ url, auth })
	const runId = await launchRun(client, job, runConfig)
	if (json) {
		process.stdout.write(`${JSON.stringify({ runId, job }, null, 2)}\n`)
		return
	}
	process.stdout.write(`Launched job ${job} — run ${runId}\n`)
}
