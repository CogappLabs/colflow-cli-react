import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { resolve } from 'node:path'
import type { Project } from '../src/project/index.ts'
import { isLocalAssetRoot, resolveAssetPath } from '../src/project/index.ts'

const fakeProject: Project = {
	root: '/srv/myproject',
	packageName: 'myproject',
	outputDir: '/srv/myproject/output',
	assetsDir: '/srv/myproject/src/myproject/defs/assets',
}

describe('resolveAssetPath', () => {
	afterEach(() => {
		delete process.env.COLFLOW_ASSET_ROOT
	})

	test('absolute path is returned as-is', () => {
		expect(resolveAssetPath('/absolute/path/file.parquet', null)).toBe(
			'/absolute/path/file.parquet',
		)
	})

	test('scheme URI is returned as-is', () => {
		expect(resolveAssetPath('s3://bucket/key.parquet', null)).toBe('s3://bucket/key.parquet')
	})

	test('gs:// URI is returned as-is', () => {
		expect(resolveAssetPath('gs://bucket/key.parquet', null)).toBe('gs://bucket/key.parquet')
	})

	test('output/ prefix resolves against project outputDir', () => {
		const result = resolveAssetPath('output/my_asset.parquet', fakeProject)
		expect(result).toBe(resolve('/srv/myproject/output', 'my_asset.parquet'))
	})

	test('output/ prefix with null project uses cwd-relative ./output', () => {
		// When project is null, assetRoot returns resolve('./output')
		const result = resolveAssetPath('output/my_asset.parquet', null)
		expect(result).toBe(resolve('./output', 'my_asset.parquet'))
	})

	test('relative path with project joins to project root', () => {
		const result = resolveAssetPath('some/relative/path.parquet', fakeProject)
		expect(result).toBe('/srv/myproject/some/relative/path.parquet')
	})

	test('relative path without project returns as-is', () => {
		const result = resolveAssetPath('some/relative/path.parquet', null)
		expect(result).toBe('some/relative/path.parquet')
	})

	test('COLFLOW_ASSET_ROOT absolute path overrides outputDir for output/ paths', () => {
		process.env.COLFLOW_ASSET_ROOT = '/mnt/assets'
		const result = resolveAssetPath('output/foo.parquet', fakeProject)
		expect(result).toBe(resolve('/mnt/assets', 'foo.parquet'))
	})
})

describe('isLocalAssetRoot', () => {
	afterEach(() => {
		delete process.env.COLFLOW_ASSET_ROOT
	})

	test('no env var returns true (local)', () => {
		delete process.env.COLFLOW_ASSET_ROOT
		expect(isLocalAssetRoot()).toBe(true)
	})

	test('empty string returns true (local)', () => {
		process.env.COLFLOW_ASSET_ROOT = ''
		expect(isLocalAssetRoot()).toBe(true)
	})

	test('local absolute path returns true', () => {
		process.env.COLFLOW_ASSET_ROOT = '/srv/myproject/output'
		expect(isLocalAssetRoot()).toBe(true)
	})

	test('s3:// scheme returns false', () => {
		process.env.COLFLOW_ASSET_ROOT = 's3://my-bucket/outputs'
		expect(isLocalAssetRoot()).toBe(false)
	})

	test('gs:// scheme returns false', () => {
		process.env.COLFLOW_ASSET_ROOT = 'gs://my-bucket/outputs'
		expect(isLocalAssetRoot()).toBe(false)
	})

	test('https:// scheme returns false', () => {
		process.env.COLFLOW_ASSET_ROOT = 'https://example.com/outputs'
		expect(isLocalAssetRoot()).toBe(false)
	})
})
