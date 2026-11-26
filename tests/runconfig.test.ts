import { describe, expect, test } from 'bun:test'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { parseTags, resolveRunConfig } from '../src/commands/_runconfig.ts'

const tmp = mkdtempSync(join(tmpdir(), 'colflow-runconfig-'))

function write(name: string, body: string): string {
	const p = join(tmp, name)
	writeFileSync(p, body)
	return p
}

describe('resolveRunConfig', () => {
	test('no flags returns empty object', () => {
		expect(resolveRunConfig({})).toEqual({})
	})

	test('inline JSON parsed', () => {
		const cfg = resolveRunConfig({
			configJson: '{"resources":{"r":{"config":{"use_vision":true}}}}',
		})
		expect(cfg).toEqual({ resources: { r: { config: { use_vision: true } } } })
	})

	test('JSON file parsed by extension', () => {
		const p = write('c.json', '{"ops":{"a":{}}}')
		expect(resolveRunConfig({ config: [p] })).toEqual({ ops: { a: {} } })
	})

	test('YAML file parsed', () => {
		const p = write('c.yaml', 'resources:\n  r:\n    config:\n      n: 3\n')
		expect(resolveRunConfig({ config: [p] })).toEqual({ resources: { r: { config: { n: 3 } } } })
	})

	test('multiple files shallow-merge left to right', () => {
		const a = write('a.json', '{"x":1,"y":1}')
		const b = write('b.json', '{"y":2,"z":3}')
		expect(resolveRunConfig({ config: [a, b] })).toEqual({ x: 1, y: 2, z: 3 })
	})

	test('inline JSON wins over file', () => {
		const a = write('base.json', '{"x":1}')
		expect(resolveRunConfig({ config: [a], configJson: '{"x":9}' })).toEqual({ x: 9 })
	})

	test('missing file throws', () => {
		expect(() => resolveRunConfig({ config: [join(tmp, 'nope.json')] })).toThrow(/cannot read/)
	})

	test('invalid inline JSON throws', () => {
		expect(() => resolveRunConfig({ configJson: '{not json' })).toThrow(/invalid JSON/)
	})

	test('non-object inline JSON throws', () => {
		expect(() => resolveRunConfig({ configJson: '[1,2]' })).toThrow(/must be a JSON object/)
	})

	test('non-mapping file throws', () => {
		const p = write('arr.json', '[1,2,3]')
		expect(() => resolveRunConfig({ config: [p] })).toThrow(/must contain a mapping/)
	})

	test('op-config sets a typed field', () => {
		const cfg = resolveRunConfig({ opConfig: ['tiler_dispatch:limit=5000'] })
		expect(cfg).toEqual({ ops: { tiler_dispatch: { config: { limit: 5000 } } } })
	})

	test('op-config parses booleans, null, and arrays as JSON', () => {
		expect(resolveRunConfig({ opConfig: ['a:x=true'] })).toEqual({
			ops: { a: { config: { x: true } } },
		})
		expect(resolveRunConfig({ opConfig: ['a:x=null'] })).toEqual({
			ops: { a: { config: { x: null } } },
		})
		expect(resolveRunConfig({ opConfig: ['a:x=[1,2]'] })).toEqual({
			ops: { a: { config: { x: [1, 2] } } },
		})
	})

	test('op-config falls back to string for non-JSON values', () => {
		const cfg = resolveRunConfig({ opConfig: ['a:name=hello world'] })
		expect(cfg).toEqual({ ops: { a: { config: { name: 'hello world' } } } })
	})

	test('op-config supports dotted keys for nested fields', () => {
		const cfg = resolveRunConfig({ opConfig: ['a:batch.size=10'] })
		expect(cfg).toEqual({ ops: { a: { config: { batch: { size: 10 } } } } })
	})

	test('multiple op-config flags merge without clobbering siblings', () => {
		const cfg = resolveRunConfig({
			opConfig: ['tiler_dispatch:limit=5000', 'tiler_dispatch:batch_pause_seconds=0'],
		})
		expect(cfg).toEqual({
			ops: { tiler_dispatch: { config: { limit: 5000, batch_pause_seconds: 0 } } },
		})
	})

	test('op-config wins over --config without dropping sibling fields', () => {
		const p = write(
			'base2.json',
			'{"ops":{"tiler_dispatch":{"config":{"limit":1,"batch_size":500}}}}',
		)
		const cfg = resolveRunConfig({
			config: [p],
			opConfig: ['tiler_dispatch:limit=5000'],
		})
		expect(cfg).toEqual({
			ops: { tiler_dispatch: { config: { limit: 5000, batch_size: 500 } } },
		})
	})

	test('op-config deep-merges into a different op set by --config-json', () => {
		const cfg = resolveRunConfig({
			configJson: '{"ops":{"other_op":{"config":{"x":1}}}}',
			opConfig: ['tiler_dispatch:limit=5000'],
		})
		expect(cfg).toEqual({
			ops: {
				other_op: { config: { x: 1 } },
				tiler_dispatch: { config: { limit: 5000 } },
			},
		})
	})

	test('op-config missing colon throws', () => {
		expect(() => resolveRunConfig({ opConfig: ['limit=5000'] })).toThrow(
			/expected <op>:<key>=<value>/,
		)
	})

	test('op-config missing equals throws', () => {
		expect(() => resolveRunConfig({ opConfig: ['tiler_dispatch:limit'] })).toThrow(
			/expected <op>:<key>=<value>/,
		)
	})

	test('op-config empty op or key throws', () => {
		expect(() => resolveRunConfig({ opConfig: [':limit=5000'] })).toThrow(
			/expected <op>:<key>=<value>/,
		)
		expect(() => resolveRunConfig({ opConfig: ['tiler_dispatch:=5000'] })).toThrow(
			/expected <op>:<key>=<value>/,
		)
	})
})

describe('parseTags', () => {
	test('no flags returns no tags', () => {
		expect(parseTags()).toEqual([])
	})

	test('parses key=value', () => {
		expect(parseTags(['famsf/notify=false'])).toEqual([{ key: 'famsf/notify', value: 'false' }])
	})

	test('splits on the first = only', () => {
		expect(parseTags(['q=a=b=c'])).toEqual([{ key: 'q', value: 'a=b=c' }])
	})

	test('allows an empty value', () => {
		expect(parseTags(['k='])).toEqual([{ key: 'k', value: '' }])
	})

	test('keeps repeated tags in order', () => {
		expect(parseTags(['a=1', 'b=2', 'a=3'])).toEqual([
			{ key: 'a', value: '1' },
			{ key: 'b', value: '2' },
			{ key: 'a', value: '3' },
		])
	})

	test('rejects a tag with no =', () => {
		expect(() => parseTags(['nope'])).toThrow(/expected key=value/)
	})

	test('rejects an empty key', () => {
		expect(() => parseTags(['=v'])).toThrow(/empty key/)
		expect(() => parseTags(['  =v'])).toThrow(/empty key/)
	})
})
