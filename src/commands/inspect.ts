import { existsSync, readdirSync } from 'node:fs'
import { inspectParquet, type SchemaNode } from '../parquet/index.ts'
import { detect, resolveParquetPath } from '../project/index.ts'

interface Opts {
	url: string
	auth?: string
	json: boolean
	path?: string
}

function humanBytes(n: number): string {
	const units = ['B', 'KiB', 'MiB', 'GiB', 'TiB']
	let i = 0
	let v = n
	while (v >= 1024 && i < units.length - 1) {
		v /= 1024
		i++
	}
	return i === 0 ? `${n} B` : `${v.toFixed(1)} ${units[i]}`
}

function pickParquet(): string | null {
	const project = detect()
	if (!project || !existsSync(project.outputDir)) return null
	const files = readdirSync(project.outputDir)
		.filter((f) => f.endsWith('.parquet'))
		.sort()
	if (files.length === 0) return null
	process.stdout.write('Parquet files in output/:\n')
	for (let i = 0; i < files.length; i++) {
		process.stdout.write(`  ${i + 1}. ${files[i]}\n`)
	}
	process.stderr.write('Pass a filename or basename to inspect.\n')
	return null
}

function printTree(node: SchemaNode, indent = ''): void {
	if (indent !== '') process.stdout.write(`${indent}${node.name}: ${node.type}\n`)
	const children = node.children ?? []
	for (let i = 0; i < children.length; i++) {
		const last = i === children.length - 1
		const branch = indent === '' ? '' : last ? '└─ ' : '├─ '
		const childIndent = indent === '' ? '' : last ? `${indent.slice(0, -3)}   ` : indent
		const ch = children[i]!
		process.stdout.write(`${childIndent}${branch}${ch.name}: ${ch.type}\n`)
		if (ch.children?.length) {
			const next = childIndent + (last ? '   ' : '│  ')
			for (const sub of ch.children) printTree(sub, `${next}├─ `)
		}
	}
}

const colourCodes = {
	red: '\x1b[31m',
	yellow: '\x1b[33m',
	green: '\x1b[32m',
	cyan: '\x1b[36m',
	gray: '\x1b[90m',
	bold: '\x1b[1m',
} as const
const reset = '\x1b[0m'
function colour(text: string, name: keyof typeof colourCodes): string {
	if (!process.stdout.isTTY) return text
	return `${colourCodes[name]}${text}${reset}`
}

export async function runInspect({ json, path }: Opts): Promise<void> {
	let resolved = path
	if (!resolved) {
		const picked = pickParquet()
		if (!picked) {
			process.exit(0)
		}
		resolved = picked
	}
	const project = detect()
	const fullPath = resolveParquetPath(resolved, project)
	if (!existsSync(fullPath)) {
		process.stderr.write(`file not found: ${fullPath}\n`)
		process.exit(1)
	}
	const info = await inspectParquet(fullPath)
	if (json) {
		process.stdout.write(`${JSON.stringify(info, null, 2)}\n`)
		return
	}
	process.stdout.write(`${colour(info.path, 'bold')}\n\n`)
	process.stdout.write(`  Size:       ${colour(humanBytes(info.sizeBytes), 'cyan')}\n`)
	process.stdout.write(`  Rows:       ${colour(String(info.rows), 'cyan')}\n`)
	process.stdout.write(`  Row groups: ${info.rowGroups}\n\n`)
	process.stdout.write(`${colour('Schema:', 'bold')}\n`)
	printTree(info.schema, '  ')

	process.stdout.write(`\n${colour('Populated:', 'bold')}\n`)
	const maxName = Math.max(...info.columns.map((c) => c.name.length))
	for (const c of info.columns) {
		const pctStr = `${c.populatedPct.toFixed(1)}%`
		const colourName: keyof typeof colourCodes =
			c.populatedPct === 100 ? 'green' : c.populatedPct >= 50 ? 'yellow' : 'red'
		process.stdout.write(
			`  ${c.name.padEnd(maxName)}  ${String(c.populated).padEnd(12)}  ${colour(
				pctStr,
				colourName,
			)}\n`,
		)
	}
}
