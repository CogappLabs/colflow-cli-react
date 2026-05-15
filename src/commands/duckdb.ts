import { spawn } from 'node:child_process'
import { existsSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { assetRoot, detectFromEnv, isLocalAssetRoot } from '../project/index.ts'

interface Opts {
	detach: boolean
}

export function findParquets(dir: string): string[] {
	if (!existsSync(dir)) return []
	const out: string[] = []
	for (const entry of readdirSync(dir)) {
		if (entry.startsWith('.')) continue
		const full = join(dir, entry)
		const stat = statSync(full)
		if (stat.isFile() && entry.endsWith('.parquet')) out.push(full)
		else if (stat.isDirectory()) out.push(...findParquets(full))
	}
	return out
}

export function viewName(path: string, root: string): string {
	const rel = path.replace(`${root}/`, '').replace(/\.parquet$/, '')
	return rel.replace(/\//g, '__')
}

export async function runDuckdb({ detach }: Opts): Promise<void> {
	if (!isLocalAssetRoot()) {
		process.stderr.write('COLFLOW_ASSET_ROOT is a remote URI; duckdb mount needs a local path.\n')
		process.exit(1)
	}
	const project = detectFromEnv()
	const root = assetRoot(project)
	if (!existsSync(root)) {
		process.stderr.write(`Asset root does not exist: ${root}\n`)
		process.exit(1)
	}
	const parquets = findParquets(root)
	if (parquets.length === 0) {
		process.stderr.write(`No parquet files under ${root}\n`)
		process.exit(1)
	}

	const dbPath = join(root, 'mount.db')
	const sql = parquets
		.map(
			(p) => `CREATE OR REPLACE VIEW "${viewName(p, root)}" AS SELECT * FROM read_parquet('${p}');`,
		)
		.join('\n')

	process.stdout.write(`Mounting ${parquets.length} parquet file(s) into ${dbPath}\n`)

	await new Promise<void>((resolve, reject) => {
		const child = spawn('duckdb', [dbPath], { stdio: ['pipe', 'inherit', 'inherit'] })
		child.stdin.write(sql)
		child.stdin.end()
		child.on('exit', (code) => {
			if (code === 0) resolve()
			else reject(new Error(`duckdb exited with code ${code}`))
		})
		child.on('error', reject)
	})

	process.stdout.write(`Launching duckdb --ui ${dbPath}\n`)

	const ui = spawn('duckdb', ['--ui', dbPath], {
		detached: detach,
		stdio: detach ? 'ignore' : 'inherit',
	})
	if (detach) {
		ui.unref()
		process.stdout.write('UI launched in background.\n')
		return
	}
	await new Promise<void>((resolve, reject) => {
		ui.on('exit', (code) => {
			if (code === 0 || code === null) resolve()
			else reject(new Error(`duckdb --ui exited with code ${code}`))
		})
		ui.on('error', reject)
	})
}
