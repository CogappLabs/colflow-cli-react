import { readFileSync } from 'node:fs'
import { extname } from 'node:path'
import { parse as parseYaml } from 'yaml'

export interface RunConfigFlags {
	config?: string[]
	configJson?: string
}

/**
 * Resolve Dagster run config from CLI flags, matching `dg launch` semantics.
 *
 * `--config <path>` may be passed multiple times; files are parsed (JSON or
 * YAML by extension) and shallow-merged left to right, so later files win.
 * `--config-json <inline>` is parsed as JSON and merged last (highest
 * precedence), for the common scripting case where a file is overkill.
 *
 * Returns `{}` when no config flags are present, preserving prior behaviour.
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

	return merged
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
