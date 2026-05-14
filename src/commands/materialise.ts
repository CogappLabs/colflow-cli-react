import { launchAssetRun, makeClient } from '../client/index.ts'

interface Opts {
	url: string
	auth?: string
	json: boolean
	assets: string[]
}

export async function runMaterialise({ url, auth, json, assets }: Opts): Promise<void> {
	if (assets.length === 0) {
		process.stderr.write('Provide one or more asset names.\n')
		process.exit(2)
	}
	const client = makeClient({ url, auth })
	const runId = await launchAssetRun(client, assets)
	if (json) {
		process.stdout.write(`${JSON.stringify({ runId, assets }, null, 2)}\n`)
		return
	}
	process.stdout.write(`Materialising ${assets.join(', ')} — run ${runId}\n`)
}
