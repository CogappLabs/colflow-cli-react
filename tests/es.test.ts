import { afterEach, describe, expect, test } from 'bun:test'
import {
	ESError,
	flattenProperties,
	hintForESError,
	humanBytesStr,
	resolveEnvRef,
	resolveKey,
	resolveUrl,
	statusColour,
} from '../src/es/index.ts'

describe('humanBytesStr', () => {
	test('zero returns "0 B"', () => {
		expect(humanBytesStr('0')).toBe('0 B')
	})

	test('bytes below 1024 returned as-is with B unit', () => {
		expect(humanBytesStr('512')).toBe('512 B')
	})

	test('exactly 1024 bytes returns "1.0 KiB"', () => {
		expect(humanBytesStr('1024')).toBe('1.0 KiB')
	})

	test('1 MiB', () => {
		expect(humanBytesStr(String(1024 * 1024))).toBe('1.0 MiB')
	})

	test('1 GiB', () => {
		expect(humanBytesStr(String(1024 * 1024 * 1024))).toBe('1.0 GiB')
	})

	test('large value reaches TiB', () => {
		expect(humanBytesStr(String(1024 * 1024 * 1024 * 1024))).toBe('1.0 TiB')
	})

	test('non-digit string is returned unchanged', () => {
		expect(humanBytesStr('abc')).toBe('abc')
	})

	test('empty string is returned unchanged', () => {
		expect(humanBytesStr('')).toBe('')
	})

	test('string with mixed digits/chars is returned unchanged', () => {
		expect(humanBytesStr('123abc')).toBe('123abc')
	})
})

describe('statusColour', () => {
	test('"green" → "green"', () => {
		expect(statusColour('green')).toBe('green')
	})

	test('"GREEN" (uppercase) → "green"', () => {
		expect(statusColour('GREEN')).toBe('green')
	})

	test('"yellow" → "yellow"', () => {
		expect(statusColour('yellow')).toBe('yellow')
	})

	test('"red" → "red"', () => {
		expect(statusColour('red')).toBe('red')
	})

	test('unknown status → "cyan"', () => {
		expect(statusColour('serverless')).toBe('cyan')
	})

	test('empty string → "cyan"', () => {
		expect(statusColour('')).toBe('cyan')
	})
})

describe('hintForESError', () => {
	function err(status: number, reason = '', type = ''): ESError {
		return new ESError(status, type, reason, '')
	}

	test('401 with key → key rejected message', () => {
		expect(hintForESError(err(401), true)).toMatch(/API key rejected/i)
	})

	test('401 without key → no API key message', () => {
		expect(hintForESError(err(401), false)).toMatch(/No API key set/i)
	})

	test('403 → permissions hint', () => {
		expect(hintForESError(err(403), false)).toMatch(/permissions/i)
	})

	test('404 with "no such index" reason → index hint', () => {
		expect(hintForESError(err(404, 'no such index [foo]'), false)).toMatch(/Index doesn't exist/i)
	})

	test('404 generic → endpoint hint', () => {
		expect(hintForESError(err(404, 'something else'), false)).toMatch(/Endpoint not found/i)
	})

	test('429 → rate limited', () => {
		expect(hintForESError(err(429), false)).toMatch(/rate limited/i)
	})

	test('503 → cluster unavailable', () => {
		expect(hintForESError(err(503), false)).toMatch(/unavailable/i)
	})

	test('unrecognised status → empty string', () => {
		expect(hintForESError(err(500), false)).toBe('')
	})
})

describe('resolveEnvRef', () => {
	afterEach(() => {
		delete process.env.MY_TEST_VAR
	})

	test('undefined input → undefined', () => {
		expect(resolveEnvRef(undefined)).toBeUndefined()
	})

	test('plain value passes through', () => {
		expect(resolveEnvRef('plain-value')).toBe('plain-value')
	})

	test('$VAR reads from process.env', () => {
		process.env.MY_TEST_VAR = 'from-env'
		expect(resolveEnvRef('$MY_TEST_VAR')).toBe('from-env')
	})

	test('$VAR with missing env returns undefined', () => {
		expect(resolveEnvRef('$MISSING_VAR_XYZ')).toBeUndefined()
	})

	test('lone $ is treated as a plain value', () => {
		expect(resolveEnvRef('$')).toBe('$')
	})
})

describe('resolveUrl', () => {
	afterEach(() => {
		delete process.env.ELASTICSEARCH_URL
		delete process.env.ELASTICO_URL
	})

	test('flag wins over env', () => {
		process.env.ELASTICSEARCH_URL = 'http://env-host:9200'
		expect(resolveUrl('http://flag-host:9200')).toBe('http://flag-host:9200')
	})

	test('ELASTICSEARCH_URL preferred over ELASTICO_URL', () => {
		process.env.ELASTICSEARCH_URL = 'http://es:9200'
		process.env.ELASTICO_URL = 'http://elastico:9200'
		expect(resolveUrl(undefined)).toBe('http://es:9200')
	})

	test('falls back to ELASTICO_URL when ELASTICSEARCH_URL not set', () => {
		process.env.ELASTICO_URL = 'http://elastico:9200'
		expect(resolveUrl(undefined)).toBe('http://elastico:9200')
	})

	test('falls back to localhost default', () => {
		expect(resolveUrl(undefined)).toBe('http://localhost:9200')
	})

	test('strips trailing slash', () => {
		expect(resolveUrl('http://host:9200/')).toBe('http://host:9200')
	})

	test('flag of "$VAR" reads env value, then strips trailing slash', () => {
		process.env.ELASTICSEARCH_URL = 'http://from-flag-env/'
		expect(resolveUrl('$ELASTICSEARCH_URL')).toBe('http://from-flag-env')
	})
})

describe('resolveKey', () => {
	afterEach(() => {
		delete process.env.ELASTICSEARCH_API_KEY
		delete process.env.ELASTICO_API_KEY
	})

	test('flag wins over env', () => {
		process.env.ELASTICSEARCH_API_KEY = 'env-key'
		expect(resolveKey('flag-key')).toBe('flag-key')
	})

	test('ELASTICSEARCH_API_KEY preferred over ELASTICO_API_KEY', () => {
		process.env.ELASTICSEARCH_API_KEY = 'es-key'
		process.env.ELASTICO_API_KEY = 'elastico-key'
		expect(resolveKey(undefined)).toBe('es-key')
	})

	test('falls back to ELASTICO_API_KEY', () => {
		process.env.ELASTICO_API_KEY = 'elastico-key'
		expect(resolveKey(undefined)).toBe('elastico-key')
	})

	test('returns undefined when nothing set', () => {
		expect(resolveKey(undefined)).toBeUndefined()
	})
})

describe('flattenProperties', () => {
	test('empty mapping → empty array', () => {
		expect(flattenProperties({})).toEqual([])
	})

	test('flat leaves keep their type', () => {
		const result = flattenProperties({
			title: { type: 'text' },
			year: { type: 'integer' },
		})
		expect(result).toContainEqual({ name: 'title', path: ['title'], type: 'text' })
		expect(result).toContainEqual({ name: 'year', path: ['year'], type: 'integer' })
	})

	test('nested object properties produce dotted paths', () => {
		const result = flattenProperties({
			location: {
				properties: {
					city: { type: 'keyword' },
					country: { type: 'keyword' },
				},
			},
		})
		expect(result).toContainEqual({ name: 'city', path: ['location', 'city'], type: 'keyword' })
		expect(result).toContainEqual({
			name: 'country',
			path: ['location', 'country'],
			type: 'keyword',
		})
	})

	test('multi-field mappings (name + name.keyword) surface both (regression)', () => {
		const result = flattenProperties({
			name: {
				type: 'text',
				fields: { keyword: { type: 'keyword' } },
			},
		})
		expect(result).toContainEqual({ name: 'name', path: ['name'], type: 'text' })
		expect(result).toContainEqual({
			name: 'keyword',
			path: ['name', 'keyword'],
			type: 'keyword',
		})
	})

	test('leaf with no explicit type defaults to "object"', () => {
		const result = flattenProperties({ payload: {} })
		expect(result).toContainEqual({ name: 'payload', path: ['payload'], type: 'object' })
	})

	test('nested object with multi-field child includes both leaves', () => {
		const result = flattenProperties({
			artist: {
				properties: {
					name: { type: 'text', fields: { raw: { type: 'keyword' } } },
				},
			},
		})
		expect(result).toContainEqual({
			name: 'name',
			path: ['artist', 'name'],
			type: 'text',
		})
		expect(result).toContainEqual({
			name: 'raw',
			path: ['artist', 'name', 'raw'],
			type: 'keyword',
		})
	})
})
