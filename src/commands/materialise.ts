import { type AssetListNode, fetchAssets, launchAssetRun, makeClient } from '../client/index.ts'
import { parseTags, resolveRunConfig } from './_runconfig.ts'

interface Opts {
	url: string
	auth?: string
	json: boolean
	assets: string[]
	groups?: string[]
	excludeGroups?: string[]
	config?: string[]
	configJson?: string
	opConfig?: string[]
	tag?: string[]
}

/**
 * Resolve names and groups to asset key paths. Named assets are passed through
 * unchecked (Dagster rejects unknown keys); with no names and no groups, every
 * asset is a candidate. Excluded groups win over names and included groups.
 */
export function selectAssets(
	nodes: Pick<AssetListNode, 'assetKey' | 'groupName'>[],
	names: string[],
	groups: string[],
	excludeGroups: string[],
): string[][] {
	const known = new Set(nodes.map((n) => n.groupName))
	const unknown = [...groups, ...excludeGroups].filter((g) => !known.has(g))
	if (unknown.length > 0) {
		const available = [...known].filter((g): g is string => g !== null).sort()
		throw new Error(`Unknown group: ${unknown.join(', ')}. Available: ${available.join(', ')}`)
	}
	const excluded = new Set(excludeGroups)
	const byName = new Map(nodes.map((n) => [n.assetKey.path.join('/'), n]))
	const picked = new Map<string, string[]>()
	if (names.length === 0 && groups.length === 0) {
		for (const n of nodes) picked.set(n.assetKey.path.join('/'), n.assetKey.path)
	}
	for (const name of names) picked.set(name, byName.get(name)?.assetKey.path ?? [name])
	for (const n of nodes) {
		if (n.groupName && groups.includes(n.groupName))
			picked.set(n.assetKey.path.join('/'), n.assetKey.path)
	}
	return [...picked.entries()]
		.filter(([key]) => {
			const g = byName.get(key)?.groupName
			return !(g && excluded.has(g))
		})
		.map(([, path]) => path)
}

export async function runMaterialise({
	url,
	auth,
	json,
	assets,
	groups = [],
	excludeGroups = [],
	config,
	configJson,
	opConfig,
	tag,
}: Opts): Promise<void> {
	if (assets.length === 0 && groups.length === 0 && excludeGroups.length === 0) {
		process.stderr.write('Provide asset names, --group, or --exclude-group.\n')
		process.exit(2)
	}
	const runConfig = resolveRunConfig({ config, configJson, opConfig })
	const tags = parseTags(tag)
	const client = makeClient({ url, auth })
	let keys: string[][]
	if (groups.length > 0 || excludeGroups.length > 0) {
		try {
			keys = selectAssets(await fetchAssets(client), assets, groups, excludeGroups)
		} catch (e) {
			process.stderr.write(`${(e as Error).message}\n`)
			process.exit(2)
		}
	} else {
		keys = assets.map((a) => [a])
	}
	if (keys.length === 0) {
		process.stderr.write('Selection matched no assets.\n')
		process.exit(2)
	}
	const names = keys.map((k) => k.join('/'))
	const runId = await launchAssetRun(client, keys, runConfig, tags)
	if (json) {
		process.stdout.write(`${JSON.stringify({ runId, assets: names }, null, 2)}\n`)
		return
	}
	process.stdout.write(`Materialising ${names.join(', ')}; run ${runId}\n`)
}
