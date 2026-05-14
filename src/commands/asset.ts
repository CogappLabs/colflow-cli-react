import { fetchAssetDetail, makeClient, type MetadataEntry } from '../client/index.ts'
import { timeAgo } from '../format/index.ts'

interface Opts {
	url: string
	auth?: string
	json: boolean
	key: string
}

function metaValue(e: MetadataEntry): string {
	if (e.text != null) return e.text
	if (e.path != null) return e.path
	if (e.intValue != null) return String(e.intValue)
	if (e.floatValue != null) return String(e.floatValue)
	if (e.boolValue != null) return String(e.boolValue)
	if (e.jsonString != null) return e.jsonString
	return e.__typename
}

export async function runAsset({ url, auth, json, key }: Opts): Promise<void> {
	const client = makeClient({ url, auth })
	const asset = await fetchAssetDetail(client, key.split('/'))
	if (!asset) {
		process.stderr.write(`Asset not found: ${key}\n`)
		process.exit(1)
	}
	if (json) {
		process.stdout.write(`${JSON.stringify(asset, null, 2)}\n`)
		return
	}
	const path = asset.assetKey.path.join('/')
	process.stdout.write(`${path}\n`)
	if (asset.description) process.stdout.write(`  ${asset.description}\n`)
	process.stdout.write('\n')
	process.stdout.write(`  Group:   ${asset.groupName ?? '-'}\n`)
	if (asset.computeKind) process.stdout.write(`  Compute: ${asset.computeKind}\n`)
	process.stdout.write(`  Stale:   ${asset.staleStatus}\n`)
	if (asset.kinds.length > 0) process.stdout.write(`  Kinds:   ${asset.kinds.join(', ')}\n`)
	if (asset.jobNames.length > 0) process.stdout.write(`  Jobs:    ${asset.jobNames.join(', ')}\n`)

	if (asset.dependencyKeys.length > 0) {
		process.stdout.write('\n  Dependencies (upstream):\n')
		for (const d of asset.dependencyKeys) process.stdout.write(`    ← ${d.path.join('/')}\n`)
	}
	if (asset.dependedByKeys.length > 0) {
		process.stdout.write('\n  Dependents (downstream):\n')
		for (const d of asset.dependedByKeys) process.stdout.write(`    → ${d.path.join('/')}\n`)
	}
	if (asset.staleCauses.length > 0) {
		process.stdout.write('\n  Stale causes:\n')
		for (const c of asset.staleCauses) {
			process.stdout.write(`    ${c.category}: ${c.reason} (${c.key.path.join('/')})\n`)
		}
	}
	if (asset.assetMaterializations.length > 0) {
		process.stdout.write('\n  Recent materializations:\n')
		for (const m of asset.assetMaterializations) {
			process.stdout.write(`    ${m.runId.slice(0, 36)}  ${timeAgo(m.timestamp)}\n`)
			for (const me of m.metadataEntries ?? []) {
				process.stdout.write(`      ${me.label}: ${metaValue(me)}\n`)
			}
		}
	}
}
