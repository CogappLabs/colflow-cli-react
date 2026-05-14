interface Opts {
	url?: string
	apiKey?: string
	insecure: boolean
	json: boolean
	indices: boolean
	index?: string
}

interface Health {
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

interface EsIndex {
	health: string
	status: string
	index: string
	'docs.count': string
	'store.size': string
}

class ESError extends Error {
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

function resolveUrl(flag: string | undefined): string {
	const v = resolveEnvRef(flag) ?? process.env.ELASTICSEARCH_URL ?? 'http://localhost:9200'
	return v.replace(/\/$/, '')
}

function resolveKey(flag: string | undefined): string | undefined {
	return resolveEnvRef(flag) ?? process.env.ELASTICSEARCH_API_KEY
}

async function esGet<T>(url: string, key: string | undefined, insecure: boolean): Promise<T> {
	const headers: Record<string, string> = { Accept: 'application/json' }
	if (key) headers.Authorization = `ApiKey ${key}`
	const res = await fetch(url, {
		headers,
		// @ts-expect-error - Bun supports tls option
		tls: insecure ? { rejectUnauthorized: false } : undefined,
	})
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

const colourCodes = {
	red: '\x1b[31m',
	yellow: '\x1b[33m',
	green: '\x1b[32m',
	gray: '\x1b[90m',
	bold: '\x1b[1m',
} as const
const reset = '\x1b[0m'
function c(text: string, name: keyof typeof colourCodes): string {
	if (!process.stdout.isTTY) return text
	return `${colourCodes[name]}${text}${reset}`
}

function statusColour(s: string): keyof typeof colourCodes {
	switch (s.toLowerCase()) {
		case 'green':
			return 'green'
		case 'yellow':
			return 'yellow'
		case 'red':
			return 'red'
		default:
			return 'gray'
	}
}

function hintForESError(err: ESError, hasKey: boolean): string {
	if (err.status === 401) {
		return hasKey
			? 'API key rejected. Verify it for this cluster.'
			: 'No API key set. Pass --api-key or set ELASTICSEARCH_API_KEY.'
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

function humanBytesStr(s: string): string {
	if (!s || !/^\d+$/.test(s)) return s
	const n = Number(s)
	const units = ['B', 'KiB', 'MiB', 'GiB', 'TiB']
	let i = 0
	let v = n
	while (v >= 1024 && i < units.length - 1) {
		v /= 1024
		i++
	}
	return i === 0 ? `${n} B` : `${v.toFixed(1)} ${units[i]}`
}

export async function runEsCheck({
	url,
	apiKey,
	insecure,
	json,
	indices,
	index,
}: Opts): Promise<void> {
	const base = resolveUrl(url)
	const key = resolveKey(apiKey)

	let health: Health
	try {
		health = await esGet<Health>(`${base}/_cluster/health`, key, insecure)
	} catch (err) {
		if (err instanceof ESError && err.status === 410) {
			const root = await esGet<{ cluster_name?: string }>(`${base}/`, key, insecure)
			health = {
				cluster_name: root.cluster_name ?? '',
				status: 'serverless',
				serverless: true,
			}
		} else {
			if (json) {
				process.stdout.write(`${JSON.stringify({ ok: false, url: base, error: String(err) })}\n`)
				process.exit(0)
			}
			process.stdout.write(`${c('✗ Elasticsearch:', 'red')} ${base}\n`)
			if (err instanceof ESError) {
				process.stdout.write(`  Status:  ${err.status}\n`)
				if (err.type) process.stdout.write(`  Type:    ${err.type}\n`)
				if (err.reason) process.stdout.write(`  Reason:  ${err.reason}\n`)
				const hint = hintForESError(err, !!key)
				if (hint) process.stdout.write(`\n${c('Hint:', 'yellow')} ${hint}\n`)
			} else {
				process.stdout.write(`  ${(err as Error).message}\n`)
			}
			process.exit(1)
		}
	}

	let indexInfo: EsIndex | undefined
	let indexErr: string | undefined
	if (index) {
		try {
			const rows = await esGet<EsIndex[]>(
				`${base}/_cat/indices/${index}?format=json&bytes=b`,
				key,
				insecure,
			)
			indexInfo = rows[0]
		} catch (e) {
			indexErr = String((e as Error).message)
		}
	}

	let indexList: EsIndex[] = []
	if (indices) {
		try {
			indexList = await esGet<EsIndex[]>(`${base}/_cat/indices?format=json&bytes=b`, key, insecure)
			indexList.sort((a, b) => a.index.localeCompare(b.index))
		} catch (e) {
			if (!json) process.stdout.write(`${c('indices fetch failed:', 'yellow')} ${e}\n`)
		}
	}

	if (json) {
		const out: Record<string, unknown> = { ok: true, url: base, health, indices: indexList }
		if (index) {
			out.index = {
				name: index,
				exists: !!indexInfo,
				...(indexErr ? { error: indexErr } : {}),
				...(indexInfo
					? {
							health: indexInfo.health,
							status: indexInfo.status,
							docs_count: indexInfo['docs.count'],
							store_size: indexInfo['store.size'],
						}
					: {}),
			}
		}
		process.stdout.write(`${JSON.stringify(out, null, 2)}\n`)
		return
	}

	process.stdout.write(`${c('Elasticsearch:', 'bold')} ${base}\n\n`)
	process.stdout.write(`  Cluster:        ${health.cluster_name}\n`)
	if (health.serverless) {
		process.stdout.write(`  Status:         ${c('serverless (reachable)', 'green')}\n`)
	} else {
		process.stdout.write(`  Status:         ${c(health.status, statusColour(health.status))}\n`)
		process.stdout.write(
			`  Nodes:          ${health.number_of_nodes ?? 0} (data: ${health.number_of_data_nodes ?? 0})\n`,
		)
		process.stdout.write(
			`  Shards:         ${health.active_shards ?? 0} active / ${health.active_primary_shards ?? 0} primary\n`,
		)
		if ((health.unassigned_shards ?? 0) > 0) {
			process.stdout.write(`  Unassigned:     ${c(String(health.unassigned_shards), 'red')}\n`)
		}
		process.stdout.write(
			`  Active %:       ${(health.active_shards_percent_as_number ?? 0).toFixed(1)}%\n`,
		)
	}

	if (index) {
		process.stdout.write(`\n${c('Index:', 'bold')} ${index}\n`)
		if (!indexInfo) {
			process.stdout.write(`  ${c('not found', 'red')}\n`)
			if (indexErr) process.stdout.write(`  ${c(indexErr, 'gray')}\n`)
		} else {
			process.stdout.write(
				`  Health:         ${c(indexInfo.health, statusColour(indexInfo.health))}\n`,
			)
			process.stdout.write(`  Docs:           ${indexInfo['docs.count']}\n`)
			process.stdout.write(`  Size:           ${humanBytesStr(indexInfo['store.size'])}\n`)
		}
	}

	if (indices && indexList.length > 0) {
		process.stdout.write(`\n${c('Indices:', 'bold')}\n`)
		const visible = indexList.filter((ix) => !ix.index.startsWith('.'))
		const maxName = Math.max(...visible.map((ix) => ix.index.length))
		for (const ix of visible) {
			process.stdout.write(
				`  ${ix.index.padEnd(maxName)}  ${c(ix.health, statusColour(ix.health))}  ${ix[
					'docs.count'
				].padEnd(10)}  ${c(humanBytesStr(ix['store.size']), 'gray')}\n`,
			)
		}
	}
}
