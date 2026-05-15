import { describe, expect, test } from 'bun:test'
import { appleQuote, shellQuote } from '../src/tui/launchTerminal.ts'

describe('shellQuote', () => {
	test('wraps simple string in single quotes', () => {
		expect(shellQuote('foo')).toBe(`'foo'`)
	})

	test('preserves spaces inside the quoted string', () => {
		expect(shellQuote('hello world')).toBe(`'hello world'`)
	})

	test('preserves a path with spaces (the actual reason this exists)', () => {
		expect(shellQuote('/Users/lukew/My Project/output')).toBe(`'/Users/lukew/My Project/output'`)
	})

	test("escapes embedded single quotes via the '\\''  trick", () => {
		expect(shellQuote("don't")).toBe(`'don'\\''t'`)
	})

	test('handles double quotes literally (no escaping needed in single quotes)', () => {
		expect(shellQuote('say "hi"')).toBe(`'say "hi"'`)
	})

	test('empty string becomes a pair of empty single quotes', () => {
		expect(shellQuote('')).toBe(`''`)
	})
})

describe('appleQuote', () => {
	test('wraps simple string in double quotes', () => {
		expect(appleQuote('foo')).toBe(`"foo"`)
	})

	test('escapes embedded double quotes', () => {
		expect(appleQuote('say "hi"')).toBe(`"say \\"hi\\""`)
	})

	test('escapes backslashes (so AppleScript sees them literally)', () => {
		expect(appleQuote('a\\b')).toBe(`"a\\\\b"`)
	})

	test('escapes backslash before double quote (regression: order matters)', () => {
		// Backslash must be escaped first; otherwise the escape sequence for the
		// double quote produces a backslash that then gets re-doubled.
		expect(appleQuote('\\"')).toBe(`"\\\\\\""`)
	})

	test('round-trips a typical osascript payload (cd to path with quotes)', () => {
		const inner = shellQuote(`/path with "weird" chars`)
		const cmd = `cd ${inner} && colflow duckdb`
		const wrapped = appleQuote(cmd)
		// Must start + end with unescaped double quote.
		expect(wrapped.startsWith('"')).toBe(true)
		expect(wrapped.endsWith('"')).toBe(true)
		// Inner double-quotes must be escaped.
		expect(wrapped.includes(`\\"weird\\"`)).toBe(true)
	})
})
