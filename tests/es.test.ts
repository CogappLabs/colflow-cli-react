import { describe, expect, test } from 'bun:test'
import { ESError, hintForESError, humanBytesStr, statusColour } from '../src/es/index.ts'

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
