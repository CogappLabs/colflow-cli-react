import { type AssetCheckSelection, launchAssetCheckRun, makeClient } from '../client/index.ts'

interface Opts {
	url: string
	auth?: string
	json: boolean
	checks: string[]
}

export async function runRecheck({ url, auth, json, checks }: Opts): Promise<void> {
	if (checks.length === 0) {
		process.stderr.write('Provide one or more selectors: asset:check_name\n')
		process.exit(2)
	}
	const selections: AssetCheckSelection[] = checks.map((s) => {
		const idx = s.indexOf(':')
		if (idx <= 0 || idx === s.length - 1) {
			throw new Error(`invalid selector "${s}" — expected asset:check_name`)
		}
		return {
			assetPath: s.slice(0, idx).split('/'),
			checkName: s.slice(idx + 1),
		}
	})
	const client = makeClient({ url, auth })
	const runId = await launchAssetCheckRun(client, selections)
	if (json) {
		process.stdout.write(`${JSON.stringify({ runId, checks }, null, 2)}\n`)
		return
	}
	process.stdout.write(`Re-checking ${checks.join(', ')} — run ${runId}\n`)
}
