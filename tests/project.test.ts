import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import type { Project } from '../src/project/index.ts'
import {
	assetRoot,
	detect,
	detectFromEnv,
	isLocalAssetRoot,
	resolveAssetPath,
	resolveParquetPath,
} from '../src/project/index.ts'

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

describe('assetRoot', () => {
	afterEach(() => {
		delete process.env.COLFLOW_ASSET_ROOT
	})

	test('absolute env var wins over project outputDir', () => {
		process.env.COLFLOW_ASSET_ROOT = '/mnt/assets'
		expect(assetRoot(fakeProject)).toBe('/mnt/assets')
	})

	test('relative env var resolves against project root', () => {
		process.env.COLFLOW_ASSET_ROOT = './outputs-2'
		expect(assetRoot(fakeProject)).toBe(resolve('/srv/myproject', './outputs-2'))
	})

	test('no env, project given → project.outputDir', () => {
		expect(assetRoot(fakeProject)).toBe('/srv/myproject/output')
	})

	test('no env, no project → cwd-relative ./output', () => {
		expect(assetRoot(null)).toBe(resolve('./output'))
	})
})

describe('detect (real fs)', () => {
	let dir: string

	beforeEach(() => {
		dir = mkdtempSync(join(tmpdir(), 'colflow-project-test-'))
	})

	afterEach(() => {
		rmSync(dir, { recursive: true, force: true })
	})

	test('returns null when no pyproject.toml is found upwards', () => {
		mkdirSync(join(dir, 'sub'))
		expect(detect(join(dir, 'sub'))).toBeNull()
	})

	test('finds pyproject.toml in same directory and parses package name', () => {
		writeFileSync(
			join(dir, 'pyproject.toml'),
			`[project]\nname = "my_project"\nversion = "0.1.0"\n`,
		)
		const project = detect(dir)
		expect(project).not.toBeNull()
		expect(project?.packageName).toBe('my_project')
		expect(project?.outputDir).toBe(join(dir, 'output'))
		expect(project?.assetsDir).toBe(join(dir, 'src', 'my_project', 'defs', 'assets'))
	})

	test('walks up from a nested cwd to find pyproject.toml', () => {
		writeFileSync(join(dir, 'pyproject.toml'), `name = "deep_pkg"\n`)
		const nested = join(dir, 'a', 'b', 'c')
		mkdirSync(nested, { recursive: true })
		const project = detect(nested)
		expect(project?.root).toBe(dir)
		expect(project?.packageName).toBe('deep_pkg')
	})

	test('falls back to "unknown" package name when name field is absent', () => {
		writeFileSync(join(dir, 'pyproject.toml'), `[tool.something]\nfoo = "bar"\n`)
		const project = detect(dir)
		expect(project?.packageName).toBe('unknown')
	})
})

describe('detectFromEnv', () => {
	let dir: string

	beforeEach(() => {
		dir = mkdtempSync(join(tmpdir(), 'colflow-detectenv-'))
	})

	afterEach(() => {
		delete process.env.COLFLOW_ASSET_ROOT
		rmSync(dir, { recursive: true, force: true })
	})

	test('absolute COLFLOW_ASSET_ROOT walks up from its dirname', () => {
		writeFileSync(join(dir, 'pyproject.toml'), `name = "envroot"\n`)
		const outputDir = join(dir, 'output')
		mkdirSync(outputDir)
		process.env.COLFLOW_ASSET_ROOT = outputDir
		const project = detectFromEnv()
		expect(project?.root).toBe(dir)
		expect(project?.packageName).toBe('envroot')
	})

	test('remote COLFLOW_ASSET_ROOT URI is ignored, falls back to cwd walk', () => {
		// Doesn't crash, doesn't try to walk a URI as a path.
		process.env.COLFLOW_ASSET_ROOT = 's3://bucket/output'
		// Result depends on cwd; just assert it doesn't throw and returns
		// either a project (if cwd is in one) or null.
		expect(() => detectFromEnv()).not.toThrow()
	})
})

describe('resolveParquetPath', () => {
	let dir: string

	beforeEach(() => {
		dir = mkdtempSync(join(tmpdir(), 'colflow-parquet-'))
		mkdirSync(join(dir, 'output'))
		mkdirSync(join(dir, 'output', 'caches'))
	})

	afterEach(() => {
		rmSync(dir, { recursive: true, force: true })
	})

	function project(): Project {
		return {
			root: dir,
			packageName: 'pkg',
			outputDir: join(dir, 'output'),
			assetsDir: join(dir, 'src', 'pkg', 'defs', 'assets'),
		}
	}

	test('absolute existing path returned as-is', () => {
		const p = join(dir, 'output', 'foo.parquet')
		writeFileSync(p, 'x')
		expect(resolveParquetPath(p, project())).toBe(p)
	})

	test('bare name resolves to <output>/<name>.parquet', () => {
		writeFileSync(join(dir, 'output', 'bar.parquet'), 'x')
		expect(resolveParquetPath('bar', project())).toBe(join(dir, 'output', 'bar.parquet'))
	})

	test('bare name with caches subdir resolves to caches path', () => {
		writeFileSync(join(dir, 'output', 'caches', 'cached.parquet'), 'x')
		expect(resolveParquetPath('cached', project())).toBe(
			join(dir, 'output', 'caches', 'cached.parquet'),
		)
	})

	test('no project, no existing file → arg returned unchanged', () => {
		expect(resolveParquetPath('nope.parquet', null)).toBe('nope.parquet')
	})
})
