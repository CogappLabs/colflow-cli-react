import { type AssetGraphNode, fetchAssetGraph, makeClient } from '../client/index.ts'

interface Opts {
	url: string
	auth?: string
	json: boolean
}

function topoSort(nodes: AssetGraphNode[]): AssetGraphNode[] {
	const byKey = new Map(nodes.map((n) => [n.assetKey.path.join('/'), n]))
	const visited = new Set<string>()
	const result: AssetGraphNode[] = []
	const visit = (k: string) => {
		if (visited.has(k)) return
		visited.add(k)
		const n = byKey.get(k)
		if (!n) return
		for (const d of n.dependencyKeys) visit(d.path.join('/'))
		result.push(n)
	}
	for (const n of nodes) visit(n.assetKey.path.join('/'))
	return result
}

export async function runGraph({ url, auth, json }: Opts): Promise<void> {
	const client = makeClient({ url, auth })
	const nodes = await fetchAssetGraph(client)
	if (json) {
		process.stdout.write(`${JSON.stringify(nodes, null, 2)}\n`)
		return
	}
	const sorted = topoSort(nodes)
	const depths = new Map<string, number>()
	for (const n of sorted) {
		const k = n.assetKey.path.join('/')
		const upstream = n.dependencyKeys.map((d) => depths.get(d.path.join('/')) ?? -1)
		depths.set(k, upstream.length === 0 ? 0 : 1 + Math.max(...upstream))
	}
	const groups = new Map<string, AssetGraphNode[]>()
	const order: string[] = []
	for (const n of sorted) {
		const g = n.groupName ?? 'ungrouped'
		if (!groups.has(g)) order.push(g)
		const arr = groups.get(g) ?? []
		arr.push(n)
		groups.set(g, arr)
	}
	for (const g of order) {
		process.stdout.write(`[${g}]\n`)
		for (const n of groups.get(g) ?? []) {
			const k = n.assetKey.path.join('/')
			const indent = '  '.repeat((depths.get(k) ?? 0) + 1)
			const deps =
				n.dependencyKeys.length > 0
					? ` ← ${n.dependencyKeys.map((d) => d.path.join('/')).join(', ')}`
					: ' (root)'
			const down =
				n.dependedByKeys.length > 0
					? ` → ${n.dependedByKeys.map((d) => d.path.join('/')).join(', ')}`
					: ' (terminal)'
			process.stdout.write(`${indent}${k}${deps}${down}\n`)
		}
		process.stdout.write('\n')
	}
}
