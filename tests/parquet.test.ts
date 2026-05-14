import { describe, expect, test } from 'bun:test'
import { collapseLeafPath, parseWhere } from '../src/parquet/index.ts'

describe('collapseLeafPath', () => {
	test('plain path passes through unchanged', () => {
		expect(collapseLeafPath(['foo', 'bar'])).toBe('foo.bar')
	})

	test('single plain segment', () => {
		expect(collapseLeafPath(['field'])).toBe('field')
	})

	test('list/element collapse', () => {
		expect(collapseLeafPath(['tags', 'list', 'element'])).toBe('tags[]')
	})

	test('array/item collapse (alternative naming)', () => {
		expect(collapseLeafPath(['tags', 'array', 'item'])).toBe('tags[]')
	})

	test('key_value map collapse', () => {
		// foo.key_value → foo{}.key
		expect(collapseLeafPath(['props', 'key_value', 'key'])).toBe('props{}.key')
	})

	test('map collapse', () => {
		expect(collapseLeafPath(['props', 'map', 'value'])).toBe('props{}.value')
	})

	test('nested: list then plain', () => {
		// items[].name
		expect(collapseLeafPath(['items', 'list', 'element', 'name'])).toBe('items[].name')
	})

	test('mixed: list inside group', () => {
		expect(collapseLeafPath(['outer', 'inner', 'list', 'element'])).toBe('outer.inner[]')
	})
})

describe('parseWhere', () => {
	test('empty array returns empty', () => {
		expect(parseWhere([])).toEqual([])
	})

	test('single simple spec', () => {
		expect(parseWhere(['field=value'])).toEqual([{ path: ['field'], value: 'value' }])
	})

	test('multiple specs', () => {
		const result = parseWhere(['a=1', 'b=2'])
		expect(result).toEqual([
			{ path: ['a'], value: '1' },
			{ path: ['b'], value: '2' },
		])
	})

	test('dotted path splits to array', () => {
		expect(parseWhere(['foo.bar=baz'])).toEqual([{ path: ['foo', 'bar'], value: 'baz' }])
	})

	test('value with = sign keeps everything after first =', () => {
		expect(parseWhere(['field=a=b'])).toEqual([{ path: ['field'], value: 'a=b' }])
	})

	test('missing = throws error', () => {
		expect(() => parseWhere(['nodash'])).toThrow('--where')
	})

	test('leading = (no field) throws error', () => {
		expect(() => parseWhere(['=value'])).toThrow('--where')
	})
})
