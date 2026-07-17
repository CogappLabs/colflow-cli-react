import { existsSync } from 'node:fs'
import { parseWhere, sampleRows } from '../parquet/index.ts'
import { detect, resolveParquetSource } from '../project/index.ts'
import { isS3Uri } from '../s3/index.ts'

interface Opts {
	url: string
	auth?: string
	json: boolean
	path: string
	rows: number
	where: string[]
	maxScan: number
}

function formatValue(v: unknown): string {
	if (v == null) return 'null'
	if (typeof v === 'string') {
		const s = v.length > 80 ? `${v.slice(0, 80)}…` : v
		return JSON.stringify(s)
	}
	if (typeof v === 'bigint') return v.toString()
	if (v instanceof Uint8Array) return JSON.stringify(Buffer.from(v).toString('utf-8'))
	if (typeof v === 'object') return JSON.stringify(v)
	return String(v)
}

export async function runSample({
	url,
	auth,
	json,
	path,
	rows,
	where,
	maxScan,
}: Opts): Promise<void> {
	const project = detect()
	const fullPath = await resolveParquetSource(path, project, { url, auth })
	if (!isS3Uri(fullPath) && !existsSync(fullPath)) {
		process.stderr.write(`file not found: ${fullPath}\n`)
		process.exit(1)
	}
	const filters = parseWhere(where)
	const out = await sampleRows(fullPath, rows, filters, maxScan)
	if (json) {
		process.stdout.write(`${JSON.stringify(out, null, 2)}\n`)
		return
	}
	if (out.length === 0) {
		process.stdout.write('(no rows)\n')
		return
	}
	for (let i = 0; i < out.length; i++) {
		process.stdout.write(`Row ${i + 1}:\n`)
		const row = out[i]!
		const keys = Object.keys(row)
		const maxKey = Math.max(...keys.map((k) => k.length))
		for (const k of keys) {
			process.stdout.write(`  ${k.padEnd(maxKey)}  ${formatValue(row[k])}\n`)
		}
		process.stdout.write('\n')
	}
}
