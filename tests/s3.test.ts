import { describe, expect, test } from 'bun:test'
import { viewName } from '../src/commands/duckdb.ts'
import { isS3Uri, mountPathToS3Uri, parseS3Uri } from '../src/s3/index.ts'

describe('isS3Uri', () => {
	test('recognises s3:// URIs', () => {
		expect(isS3Uri('s3://bucket/key.parquet')).toBe(true)
		expect(isS3Uri('S3://bucket/key.parquet')).toBe(true)
	})
	test('rejects local paths', () => {
		expect(isS3Uri('/mnt/s3files/output/x.parquet')).toBe(false)
		expect(isS3Uri('output/x.parquet')).toBe(false)
	})
})

describe('parseS3Uri', () => {
	test('splits bucket and key', () => {
		expect(parseS3Uri('s3://famsf-cf-assets/output/x.parquet')).toEqual({
			bucket: 'famsf-cf-assets',
			key: 'output/x.parquet',
		})
	})
	test('throws on a non-object URI', () => {
		expect(() => parseS3Uri('s3://bucket')).toThrow()
	})
})

describe('mountPathToS3Uri', () => {
	test('rewrites a mount path under the root to the bucket', () => {
		expect(
			mountPathToS3Uri(
				'/mnt/s3files/output/editorial_raw.parquet',
				'/mnt/s3files',
				'famsf-cf-assets',
			),
		).toBe('s3://famsf-cf-assets/output/editorial_raw.parquet')
	})
	test('tolerates a trailing slash on the mount root', () => {
		expect(mountPathToS3Uri('/mnt/s3files/output/x.parquet', '/mnt/s3files/', 'bkt')).toBe(
			's3://bkt/output/x.parquet',
		)
	})
	test('passes an s3:// path through unchanged', () => {
		expect(mountPathToS3Uri('s3://other/already.parquet', '/mnt/s3files', 'bkt')).toBe(
			's3://other/already.parquet',
		)
	})
	test('returns null for a path outside the mount root', () => {
		expect(mountPathToS3Uri('/opt/dagster/output/x.parquet', '/mnt/s3files', 'bkt')).toBeNull()
	})
	test('returns null when config is missing', () => {
		expect(mountPathToS3Uri('/mnt/s3files/output/x.parquet', undefined, undefined)).toBeNull()
	})
})

describe('viewName with s3 URIs', () => {
	test('strips the s3://bucket/ prefix', () => {
		expect(viewName('s3://famsf-cf-assets/output/foo.parquet', 's3://famsf-cf-assets/output')).toBe(
			'foo',
		)
	})
	test('flattens subfolders under an s3 root', () => {
		expect(viewName('s3://bkt/output/caches/bar.parquet', 's3://bkt/output')).toBe('caches__bar')
	})
})
