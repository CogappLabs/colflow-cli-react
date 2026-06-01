import { launchAssetRun, makeClient } from '../client/index.ts'
import { resolveRunConfig } from './_runconfig.ts'

interface Opts {
	url: string
	auth?: string
	json: boolean
	assets: string[]
	config?: string[]
	configJson?: string
}

export async function runMaterialise({
	url,
	auth,
	json,
	assets,
	config,
	configJson,
}: Opts): Promise<void> {
	if (assets.length === 0) {
		process.stderr.write('Provide one or more asset names.\n')
		process.exit(2)
	}
	const runConfig = resolveRunConfig({ config, configJson })
	const client = makeClient({ url, auth })
	const runId = await launchAssetRun(client, assets, runConfig)
	if (json) {
		process.stdout.write(`${JSON.stringify({ runId, assets }, null, 2)}\n`)
		return
	}
	process.stdout.write(`Materialising ${assets.join(', ')} — run ${runId}\n`)
}
