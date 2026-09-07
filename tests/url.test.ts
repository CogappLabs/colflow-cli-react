import { describe, expect, it } from 'bun:test'
import { splitBasicAuth } from '../src/client/url.ts'

describe('splitBasicAuth', () => {
	it('leaves a URL without userinfo alone', () => {
		expect(splitBasicAuth('https://example.com')).toEqual({ url: 'https://example.com' })
	})

	it('splits out credentials', () => {
		expect(splitBasicAuth('https://user:pass@example.com')).toEqual({
			url: 'https://example.com',
			basicAuth: 'user:pass',
		})
	})

	it('keeps the path', () => {
		expect(splitBasicAuth('http://u:p@example.com:3000/x')).toEqual({
			url: 'http://example.com:3000/x',
			basicAuth: 'u:p',
		})
	})

	it('decodes percent-encoded credentials', () => {
		expect(splitBasicAuth('https://u:a%23b@example.com').basicAuth).toBe('u:a#b')
	})

	it('takes a lone percent literally rather than throwing', () => {
		expect(splitBasicAuth('https://u:a%b@example.com').basicAuth).toBe('u:a%b')
	})

	it('ignores an @ that appears after the host', () => {
		expect(splitBasicAuth('https://example.com/a@b')).toEqual({ url: 'https://example.com/a@b' })
	})
})
