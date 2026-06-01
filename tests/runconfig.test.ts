import { describe, expect, test } from 'bun:test'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { resolveRunConfig } from '../src/commands/_runconfig.ts'

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
})
