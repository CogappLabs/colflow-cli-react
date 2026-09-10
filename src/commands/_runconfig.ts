import { readFileSync } from 'node:fs'
import { extname } from 'node:path'
import { parse as parseYaml } from 'yaml'

export interface RunConfigFlags {
	config?: string[]
	configJson?: string
	opConfig?: string[]
}

/**
 * Resolve Dagster run config from CLI flags, matching `dg launch` semantics.
 *
 * Layers merge in precedence order: `--config` file(s) (shallow, left to
 * right), then `--config-json`, then `--op-config` (deep-merged into
 * `ops.<op>.config.<key>` so one field never clobbers siblings already set
 * by an earlier layer). Returns `{}` with no flags, preserving prior
 * behaviour.
 */
export function resolveRunConfig(flags: RunConfigFlags): Record<string, unknown> {
	const paths = flags.config ?? []
	let merged: Record<string, unknown> = {}

	for (const p of paths) {
		let raw: string
		try {
			raw = readFileSync(p, 'utf8')
		} catch (err) {
			throw new Error(`--config: cannot read ${p}: ${(err as Error).message}`)
		}
		const parsed = parseConfigFile(p, raw)
		merged = { ...merged, ...parsed }
	}

	if (flags.configJson != null) {
		let parsed: unknown
		try {
			parsed = JSON.parse(flags.configJson)
		} catch (err) {
			throw new Error(`--config-json: invalid JSON: ${(err as Error).message}`)
		}
		if (!isObject(parsed)) throw new Error('--config-json: must be a JSON object')
		merged = { ...merged, ...parsed }
	}

	for (const pair of flags.opConfig ?? []) {
		merged = deepMerge(merged, parseOpConfig(pair))
	}

	return merged
}

/**
 * Parse one `<op>:<key>=<value>` pair into `{ops: {<op>: {config: {<key>: <value>}}}}`.
 *
 * `<key>` may be dotted (`batch.size`) to reach a nested config field.
 * `<value>` parses as JSON when possible (so `5000`, `true`, `null`, `[1,2]`
 * type correctly), falling back to the raw string otherwise.
 */
function parseOpConfig(pair: string): Record<string, unknown> {
	const colonIdx = pair.indexOf(':')
	const eqIdx = pair.indexOf('=')
	if (colonIdx < 0 || eqIdx < 0 || eqIdx < colonIdx) {
		throw new Error(`--op-config: invalid "${pair}", expected <op>:<key>=<value>`)
	}
	const op = pair.slice(0, colonIdx)
	const key = pair.slice(colonIdx + 1, eqIdx)
	const rawValue = pair.slice(eqIdx + 1)
	if (!op || !key) {
		throw new Error(`--op-config: invalid "${pair}", expected <op>:<key>=<value>`)
	}

	let value: unknown
	try {
		value = JSON.parse(rawValue)
	} catch {
		value = rawValue
	}

	const keyPath = key.split('.')
	let leaf: Record<string, unknown> = {}
	const config: Record<string, unknown> = leaf
	for (let i = 0; i < keyPath.length - 1; i++) {
		const next: Record<string, unknown> = {}
		leaf[keyPath[i]] = next
		leaf = next
	}
	leaf[keyPath[keyPath.length - 1]] = value

	return { ops: { [op]: { config } } }
}

function deepMerge(
	a: Record<string, unknown>,
	b: Record<string, unknown>,
): Record<string, unknown> {
	const out: Record<string, unknown> = { ...a }
	for (const [key, bVal] of Object.entries(b)) {
		const aVal = out[key]
		out[key] = isObject(aVal) && isObject(bVal) ? deepMerge(aVal, bVal) : bVal
	}
	return out
}

function parseConfigFile(path: string, raw: string): Record<string, unknown> {
	const ext = extname(path).toLowerCase()
	let parsed: unknown
	if (ext === '.json') {
		try {
			parsed = JSON.parse(raw)
		} catch (err) {
			throw new Error(`--config: invalid JSON in ${path}: ${(err as Error).message}`)
		}
	} else {
		// .yaml / .yml / anything else: YAML is a JSON superset, so this also
		// parses plain JSON files that lack a .json extension.
		try {
			parsed = parseYaml(raw)
		} catch (err) {
			throw new Error(`--config: invalid YAML in ${path}: ${(err as Error).message}`)
		}
	}
	if (!isObject(parsed))
		throw new Error(`--config: ${path} must contain a mapping at the top level`)
	return parsed
}

function isObject(v: unknown): v is Record<string, unknown> {
	return typeof v === 'object' && v !== null && !Array.isArray(v)
}
