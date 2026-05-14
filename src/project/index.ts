import { existsSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { config } from 'dotenv'

export interface Project {
	root: string
	packageName: string
	outputDir: string
	assetsDir: string
}

export function cwd(): string {
	return process.cwd()
}

export function detect(start: string = cwd()): Project | null {
	let dir = resolve(start)
	while (true) {
		const pyproject = join(dir, 'pyproject.toml')
		if (existsSync(pyproject)) {
			const content = readFileSync(pyproject, 'utf-8')
			const nameMatch = content.match(/name\s*=\s*"([^"]+)"/)
			const packageName = nameMatch?.[1] ?? 'unknown'
			return {
				root: dir,
				packageName,
				outputDir: join(dir, 'output'),
				assetsDir: join(dir, 'src', packageName, 'defs', 'assets'),
			}
		}
		const parent = dirname(dir)
		if (parent === dir) return null
		dir = parent
	}
}

export function loadDotEnv(root?: string): void {
	const r = root ?? detect()?.root
	if (!r) return
	config({ path: join(r, '.env') })
	config({ path: join(r, '.env.local'), override: true })
}

/**
 * Resolve project by walking up from COLFLOW_ASSET_ROOT (if absolute local path)
 * or cwd. Lets the TUI find local parquet outputs from anywhere.
 */
export function detectFromEnv(): Project | null {
	const assetRootEnv = process.env.COLFLOW_ASSET_ROOT
	if (assetRootEnv && assetRootEnv.startsWith('/')) {
		const p = detect(dirname(assetRootEnv))
		if (p) return p
	}
	return detect()
}

export function isLocalAssetRoot(): boolean {
	const env = process.env.COLFLOW_ASSET_ROOT
	if (!env) return true
	return !/^[a-z]+:\/\//i.test(env)
}

export function assetRoot(project: Project | null): string {
	const env = process.env.COLFLOW_ASSET_ROOT
	if (env && env.startsWith('/')) return env
	if (env && env.startsWith('.') && project) return resolve(project.root, env)
	return project?.outputDir ?? resolve('./output')
}

export function resolveAssetPath(metaPath: string, project: Project | null): string {
	if (metaPath.startsWith('/')) return metaPath
	if (/^[a-z]+:\/\//i.test(metaPath)) return metaPath
	if (metaPath.startsWith('output/')) {
		const base = assetRoot(project)
		return resolve(base, metaPath.slice('output/'.length))
	}
	if (project) return join(project.root, metaPath)
	return metaPath
}

export function resolveParquetPath(arg: string, project: Project | null): string {
	if (existsSync(arg)) return arg
	if (!project) return arg
	const candidates = [
		join(project.outputDir, arg),
		join(project.outputDir, `${arg}.parquet`),
		join(project.outputDir, 'caches', `${arg}.parquet`),
	]
	for (const c of candidates) if (existsSync(c)) return c
	return candidates[1]!
}
