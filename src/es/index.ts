/**
 * Shared Elasticsearch client used by both the `es-check` one-shot command
 * and the TUI ESCheck screen. Reads URL/key from flags or env (ELASTICSEARCH_*
 * preferred, falls back to ELASTICO_*).
 */

export interface Health {
	cluster_name: string
	status: string
	number_of_nodes?: number
	number_of_data_nodes?: number
	active_primary_shards?: number
	active_shards?: number
	unassigned_shards?: number
	active_shards_percent_as_number?: number
	serverless?: boolean
}

export interface EsIndex {
	health: string
	status: string
	index: string
	'docs.count': string
	'store.size': string
}

export class ESError extends Error {
	constructor(
		public status: number,
		public type: string,
		public reason: string,
		public raw: string,
	) {
		super(reason || raw || String(status))
	}
}

function resolveEnvRef(v: string | undefined): string | undefined {
	if (!v) return undefined
	if (v.startsWith('$') && v.length > 1) return process.env[v.slice(1)]
	return v
}

export function resolveUrl(flag: string | undefined): string {
	const v =
		resolveEnvRef(flag) ??
		process.env.ELASTICSEARCH_URL ??
		process.env.ELASTICO_URL ??
		'http://localhost:9200'
	return v.replace(/\/$/, '')
}

export function resolveKey(flag: string | undefined): string | undefined {
	return resolveEnvRef(flag) ?? process.env.ELASTICSEARCH_API_KEY ?? process.env.ELASTICO_API_KEY
}

export async function esGet<T>(
	url: string,
	key: string | undefined,
	insecure: boolean,
): Promise<T> {
	const headers: Record<string, string> = { Accept: 'application/json' }
	if (key) headers.Authorization = `ApiKey ${key}`
	const res = await fetch(url, {
		headers,
		tls: insecure ? { rejectUnauthorized: false } : undefined,
	} as RequestInit)
	const body = await res.text()
	if (res.status >= 400) {
		let type = ''
		let reason = ''
		try {
			const parsed = JSON.parse(body) as { error?: { type?: string; reason?: string } }
			type = parsed.error?.type ?? ''
			reason = parsed.error?.reason ?? ''
		} catch {}
		throw new ESError(res.status, type, reason, body)
	}
	return JSON.parse(body) as T
}

export async function fetchHealth(
	base: string,
	key: string | undefined,
	insecure: boolean,
): Promise<Health> {
	try {
		return await esGet<Health>(`${base}/_cluster/health`, key, insecure)
	} catch (err) {
		// Elastic Cloud Serverless returns 410 for /_cluster/health.
		if (err instanceof ESError && err.status === 410) {
			const root = await esGet<{ cluster_name?: string }>(`${base}/`, key, insecure)
			return {
				cluster_name: root.cluster_name ?? '',
				status: 'serverless',
				serverless: true,
			}
		}
		throw err
	}
}

export async function fetchIndices(
	base: string,
	key: string | undefined,
	insecure: boolean,
): Promise<EsIndex[]> {
	const rows = await esGet<EsIndex[]>(
		`${base}/_cat/indices?format=json&bytes=b`,
		key,
		insecure,
	)
	return rows.sort((a, b) => a.index.localeCompare(b.index))
}

export interface EsAlias {
	alias: string
	index: string
	is_write_index: string // "true" / "false" / "-"
}

export async function fetchAliases(
	base: string,
	key: string | undefined,
	insecure: boolean,
): Promise<EsAlias[]> {
	const rows = await esGet<EsAlias[]>(`${base}/_cat/aliases?format=json`, key, insecure)
	return rows.sort(
		(a, b) => a.alias.localeCompare(b.alias) || a.index.localeCompare(b.index),
	)
}

export async function fetchIndex(
	base: string,
	name: string,
	key: string | undefined,
	insecure: boolean,
): Promise<EsIndex | null> {
	const rows = await esGet<EsIndex[]>(
		`${base}/_cat/indices/${name}?format=json&bytes=b`,
		key,
		insecure,
	)
	return rows[0] ?? null
}

export function statusColour(s: string): string {
	switch (s.toLowerCase()) {
		case 'green':
			return 'green'
		case 'yellow':
			return 'yellow'
		case 'red':
			return 'red'
		default:
			return 'cyan'
	}
}

export function humanBytesStr(s: string): string {
	if (!s || !/^\d+$/.test(s)) return s
	const n = Number(s)
	if (n === 0) return '0 B'
	const units = ['B', 'KiB', 'MiB', 'GiB', 'TiB']
	let i = 0
	let v = n
	while (v >= 1024 && i < units.length - 1) {
		v /= 1024
		i++
	}
	return i === 0 ? `${n} B` : `${v.toFixed(1)} ${units[i]}`
}

export function hintForESError(err: ESError, hasKey: boolean): string {
	if (err.status === 401) {
		return hasKey
			? 'API key rejected. Verify it for this cluster.'
			: 'No API key set. Pass --api-key or set ELASTICSEARCH_API_KEY (or ELASTICO_API_KEY).'
	}
	if (err.status === 403) return 'Authenticated but lacks permissions.'
	if (err.status === 404) {
		if (err.reason.includes('no such index')) return "Index doesn't exist."
		return 'Endpoint not found. Confirm URL points at Elasticsearch (not Kibana).'
	}
	if (err.status === 429) return 'Rate limited.'
	if (err.status === 503) return 'Cluster unavailable.'
	return ''
}
