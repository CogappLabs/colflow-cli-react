import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { findParquets, viewName } from '../src/commands/duckdb.ts'

describe('viewName', () => {
	test('top-level parquet uses bare name', () => {
		expect(viewName('/srv/p/output/foo.parquet', '/srv/p/output')).toBe('foo')
	})

	test('one-level subfolder joined with double underscore', () => {
		expect(viewName('/srv/p/output/caches/bar.parquet', '/srv/p/output')).toBe('caches__bar')
	})

	test('deeply nested path flattens every separator', () => {
		expect(viewName('/srv/p/output/a/b/c/d.parquet', '/srv/p/output')).toBe('a__b__c__d')
	})

	test('strips .parquet extension only at end', () => {
		expect(viewName('/srv/p/output/with.parquet.in.name.parquet', '/srv/p/output')).toBe(
			'with.parquet.in.name',
		)
	})
})

describe('findParquets', () => {
	let dir: string

	beforeEach(() => {
		dir = mkdtempSync(join(tmpdir(), 'colflow-duckdb-test-'))
	})

	afterEach(() => {
		rmSync(dir, { recursive: true, force: true })
	})

	test('returns empty array for missing directory', () => {
		expect(findParquets(join(dir, 'does-not-exist'))).toEqual([])
	})

	test('returns empty array for directory with no parquets', () => {
		writeFileSync(join(dir, 'README.md'), 'x')
		expect(findParquets(dir)).toEqual([])
	})

	test('finds parquets at the top level', () => {
		writeFileSync(join(dir, 'a.parquet'), 'x')
		writeFileSync(join(dir, 'b.parquet'), 'x')
		const result = findParquets(dir).sort()
		expect(result).toEqual([join(dir, 'a.parquet'), join(dir, 'b.parquet')])
	})

	test('finds parquets one level deep', () => {
		mkdirSync(join(dir, 'caches'))
		writeFileSync(join(dir, 'caches', 'cached.parquet'), 'x')
		expect(findParquets(dir)).toEqual([join(dir, 'caches', 'cached.parquet')])
	})

	test('recurses into nested subdirectories (regression: was one level only)', () => {
		mkdirSync(join(dir, 'a', 'b', 'c'), { recursive: true })
		writeFileSync(join(dir, 'a', 'b', 'c', 'deep.parquet'), 'x')
		expect(findParquets(dir)).toEqual([join(dir, 'a', 'b', 'c', 'deep.parquet')])
	})

	test('skips dotfile directories like .DS_Store and .duckdb', () => {
		mkdirSync(join(dir, '.hidden'))
		writeFileSync(join(dir, '.hidden', 'ignored.parquet'), 'x')
		writeFileSync(join(dir, '.DS_Store'), 'x')
		writeFileSync(join(dir, 'visible.parquet'), 'x')
		expect(findParquets(dir)).toEqual([join(dir, 'visible.parquet')])
	})

	test('ignores non-parquet files in subdirectories', () => {
		mkdirSync(join(dir, 'sub'))
		writeFileSync(join(dir, 'sub', 'note.txt'), 'x')
		writeFileSync(join(dir, 'sub', 'data.parquet'), 'x')
		expect(findParquets(dir)).toEqual([join(dir, 'sub', 'data.parquet')])
	})
})
