import { spawn } from 'node:child_process'
import { detect, cwd } from '../project/index.ts'

interface Opts {
	debug: boolean
}

export async function runDevServer({ debug }: Opts): Promise<void> {
	const project = detect(cwd())
	if (!project) {
		process.stderr.write('No pyproject.toml found in cwd or ancestors.\n')
		process.exit(1)
	}
	const env = { ...process.env, ...(debug ? { DAGSTER_DEBUG: '1' } : {}) }
	const label = debug ? 'dg dev (DAGSTER_DEBUG=1)' : 'dg dev'
	process.stdout.write(`Starting ${label} in ${project.root}\n`)
	const child = spawn('uv', ['run', 'dg', 'dev'], {
		cwd: project.root,
		stdio: 'inherit',
		env,
	})
	await new Promise<void>((resolve, reject) => {
		child.on('exit', (code) => {
			if (code === 0 || code === null) resolve()
			else reject(new Error(`dg dev exited with code ${code}`))
		})
		child.on('error', reject)
	})
}
