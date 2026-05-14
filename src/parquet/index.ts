import { statSync } from 'node:fs'
import {
	asyncBufferFromFile,
	type FileMetaData,
	parquetMetadataAsync,
	parquetReadObjects,
	parquetSchema,
} from 'hyparquet'
import { compressors } from 'hyparquet-compressors'

export interface SchemaNode {
	name: string
	type: string
	repetition?: string
	children?: SchemaNode[]
}

export interface ParquetInfo {
	path: string
	sizeBytes: number
	rows: number
	rowGroups: number
	schema: SchemaNode
	columns: ColumnInfo[]
}

export interface ColumnInfo {
	name: string
	pathInSchema: string[]
	nullCount: number
	populated: number
	populatedPct: number
}

export async function readMetadata(path: string): Promise<{
	buffer: Awaited<ReturnType<typeof asyncBufferFromFile>>
	meta: FileMetaData
	size: number
}> {
	const size = statSync(path).size
	const buffer = await asyncBufferFromFile(path)
	const meta = await parquetMetadataAsync(buffer)
	return { buffer, meta, size }
}

function logicalName(el: {
	type?: string
	logical_type?: { type?: string }
	converted_type?: string
}): string {
	if (el.logical_type?.type) return String(el.logical_type.type).toLowerCase()
	if (el.converted_type) return String(el.converted_type).toLowerCase()
	if (el.type) return String(el.type).toLowerCase()
	return 'group'
}

function buildSchemaTree(meta: FileMetaData): SchemaNode {
	const root = parquetSchema(meta)
	const walk = (n: ReturnType<typeof parquetSchema>): SchemaNode => {
		const el = n.element
		const node: SchemaNode = {
			name: el.name,
			type: n.children.length > 0 ? 'group' : logicalName(el),
		}
		if (el.repetition_type) node.repetition = String(el.repetition_type).toLowerCase()
		if (n.children.length > 0) node.children = n.children.map(walk)
		return node
	}
	return walk(root)
}

export function collapseLeafPath(path: string[]): string {
	const out: string[] = []
	let i = 0
	while (i < path.length) {
		const seg = path[i]!
		if (i + 1 < path.length) {
			const next = path[i + 1]?.toLowerCase()
			if ((next === 'list' || next === 'array') && i + 2 < path.length) {
				const elem = path[i + 2]?.toLowerCase()
				if (elem === 'element' || elem === 'item') {
					out.push(`${seg}[]`)
					i += 3
					continue
				}
			}
			if (next === 'key_value' || next === 'map') {
				out.push(`${seg}{}`)
				i += 2
				if (i < path.length) {
					out.push(path[i]!)
					i++
				}
				continue
			}
		}
		out.push(seg)
		i++
	}
	return out.join('.')
}

function leafPaths(meta: FileMetaData): string[][] {
	const out: string[][] = []
	const rg = meta.row_groups[0]
	if (!rg) return out
	for (const c of rg.columns) {
		if (c.meta_data?.path_in_schema) {
			out.push([...c.meta_data.path_in_schema])
		}
	}
	return out
}

function nullCounts(meta: FileMetaData, paths: string[][]): Map<string, number> {
	const map = new Map<string, number>()
	for (const p of paths) map.set(p.join('.'), 0)
	for (const rg of meta.row_groups) {
		for (const col of rg.columns) {
			const path = col.meta_data?.path_in_schema
			const stats = col.meta_data?.statistics
			if (!path || !stats?.null_count) continue
			const key = path.join('.')
			const prev = map.get(key) ?? 0
			map.set(key, prev + Number(stats.null_count))
		}
	}
	return map
}

export async function inspectParquet(path: string): Promise<ParquetInfo> {
	const { meta, size } = await readMetadata(path)
	const totalRows = Number(meta.num_rows)
	const paths = leafPaths(meta)
	const nulls = nullCounts(meta, paths)
	const columns: ColumnInfo[] = paths.map((p) => {
		const key = p.join('.')
		const nullCount = nulls.get(key) ?? 0
		const populated = totalRows - nullCount
		const pct = totalRows > 0 ? (100 * populated) / totalRows : 0
		return {
			name: collapseLeafPath(p),
			pathInSchema: p,
			nullCount,
			populated,
			populatedPct: pct,
		}
	})
	return {
		path,
		sizeBytes: size,
		rows: totalRows,
		rowGroups: meta.row_groups.length,
		schema: buildSchemaTree(meta),
		columns,
	}
}

export async function sampleRows(
	path: string,
	limit: number,
	filters: { path: string[]; value: string }[],
	maxScan: number,
): Promise<Record<string, unknown>[]> {
	const buffer = await asyncBufferFromFile(path)
	if (filters.length === 0) {
		return parquetReadObjects({ file: buffer, rowEnd: limit, compressors })
	}
	const out: Record<string, unknown>[] = []
	const batch = 1024
	let scanned = 0
	while (out.length < limit && scanned < maxScan) {
		const end = Math.min(scanned + batch, maxScan)
		const chunk = await parquetReadObjects({
			file: buffer,
			rowStart: scanned,
			rowEnd: end,
			compressors,
		})
		if (chunk.length === 0) break
		for (const row of chunk) {
			if (out.length >= limit) break
			if (matchesFilters(row, filters)) out.push(row)
		}
		scanned = end
	}
	return out
}

export function parseWhere(specs: string[]): { path: string[]; value: string }[] {
	return specs.map((s) => {
		const idx = s.indexOf('=')
		if (idx <= 0) throw new Error(`--where ${JSON.stringify(s)} must be field=value`)
		return { path: s.slice(0, idx).trim().split('.'), value: s.slice(idx + 1) }
	})
}

function lookupNested(obj: unknown, path: string[]): unknown {
	let cur: unknown = obj
	for (const seg of path) {
		if (cur && typeof cur === 'object' && seg in (cur as Record<string, unknown>)) {
			cur = (cur as Record<string, unknown>)[seg]
		} else {
			return undefined
		}
	}
	return cur
}

function matchesFilters(
	row: Record<string, unknown>,
	filters: { path: string[]; value: string }[],
): boolean {
	for (const f of filters) {
		const v = lookupNested(row, f.path)
		if (v == null) {
			if (f.value === '' || f.value.toLowerCase() === 'null') continue
			return false
		}
		if (String(v) !== f.value) return false
	}
	return true
}
