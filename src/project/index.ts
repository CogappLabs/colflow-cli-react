import { existsSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { config } from 'dotenv'
import { fetchAssetMaterializationPath, makeClient } from '../client/index.ts'
import { isS3Uri, mountPathToS3Uri } from '../s3/index.ts'

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
	if (assetRootEnv?.startsWith('/')) {
		const p = detect(dirname(assetRootEnv))
		if (p) return p
	}
	return detect()
}

export function isLocalAssetRoot(): boolean {
	const env = process.env.COLFLOW_ASSET_ROOT
	if (!env) return true
	return !/^[a-z][a-z0-9+.-]*:\/\//i.test(env)
}

export function assetRoot(project: Project | null): string {
	const env = process.env.COLFLOW_ASSET_ROOT
	if (env?.startsWith('/')) return env
	if (env?.startsWith('.') && project) return resolve(project.root, env)
	return project?.outputDir ?? resolve('./output')
}

export function resolveAssetPath(metaPath: string, project: Project | null): string {
	if (metaPath.startsWith('/')) return metaPath
	if (/^[a-z][a-z0-9+.-]*:\/\//i.test(metaPath)) return metaPath
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

/** COLFLOW_MOUNT_ROOT / COLFLOW_S3_BUCKET, the mount-path to S3 rewrite config. */
export function s3Config(): { mountRoot?: string; bucket?: string } {
	return {
		mountRoot: process.env.COLFLOW_MOUNT_ROOT,
		bucket: process.env.COLFLOW_S3_BUCKET,
	}
}

/**
 * Resolve an inspect/sample argument to something a reader can open, preferring
 * S3 when this is a remote deployment.
 *
 * - An `s3://` argument is used as-is.
 * - A bare asset name with S3 config set is looked up against Dagster: its
 *   latest materialisation path is rewritten from the mount root to the bucket.
 * - Otherwise it falls back to the local `resolveParquetPath`.
 */
export async function resolveParquetSource(
	arg: string,
	project: Project | null,
	dagster: { url: string; auth?: string },
): Promise<string> {
	if (isS3Uri(arg)) return arg

	const { mountRoot, bucket } = s3Config()
	const looksLikePath = arg.includes('/') || arg.endsWith('.parquet') || existsSync(arg)
	if (bucket && !looksLikePath) {
		const client = makeClient({ url: dagster.url, auth: dagster.auth })
		const reported = await fetchAssetMaterializationPath(client, arg.split('/'))
		if (reported) {
			const s3 = mountPathToS3Uri(reported, mountRoot, bucket)
			if (s3) return s3
		}
	}
	return resolveParquetPath(arg, project)
}
