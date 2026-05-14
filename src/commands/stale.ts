import { fetchStaleAssets, makeClient } from '../client/index.ts'
import { timeAgo } from '../format/index.ts'

interface Opts {
	url: string
	auth?: string
	json: boolean
}

export async function runStale({ url, auth, json }: Opts): Promise<void> {
	const client = makeClient({ url, auth })
	const stale = await fetchStaleAssets(client)
	if (json) {
		process.stdout.write(`${JSON.stringify(stale, null, 2)}\n`)
		return
	}
	if (stale.length === 0) {
		process.stdout.write('All assets are fresh\n')
		return
	}
	process.stdout.write(`${stale.length} stale asset(s):\n\n`)
	const maxName = Math.max(...stale.map((a) => a.assetKey.path.join('/').length))
	for (const a of stale) {
		const name = a.assetKey.path.join('/')
		const group = a.groupName ?? 'ungrouped'
		const lastMat = a.assetMaterializations[0]
			? timeAgo(a.assetMaterializations[0].timestamp)
			: 'never'
		process.stdout.write(
			`  ${a.staleStatus.padEnd(8)}  ${name.padEnd(maxName)}  ${group}  last: ${lastMat}\n`,
		)
		for (const c of a.staleCauses) {
			process.stdout.write(
				`         ${c.category}: ${c.reason} (${c.key.path.join('/')})\n`,
			)
		}
	}
}
