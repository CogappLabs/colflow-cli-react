import { describe, expect, test } from 'bun:test'
import type { MetadataEntry } from '../src/client/index.ts'
import {
	formatMetadataEntry,
	formatTimestamp,
	statusColour,
	timeAgo,
	tsToSeconds,
} from '../src/format/index.ts'

describe('tsToSeconds', () => {
	test('ms timestamp (>1e12) is converted to seconds', () => {
		expect(tsToSeconds(1_700_000_000_000)).toBe(1_700_000_000)
	})

	test('seconds timestamp is returned as-is', () => {
		expect(tsToSeconds(1_700_000_000)).toBe(1_700_000_000)
	})

	test('null returns null', () => {
		expect(tsToSeconds(null)).toBeNull()
	})

	test('NaN string returns null', () => {
		expect(tsToSeconds('not-a-number')).toBeNull()
	})

	test('numeric string in seconds', () => {
		expect(tsToSeconds('1700000000')).toBe(1_700_000_000)
	})

	test('numeric string in ms', () => {
		expect(tsToSeconds('1700000000000')).toBe(1_700_000_000)
	})
})

describe('timeAgo', () => {
	test('null returns dash', () => {
		expect(timeAgo(null)).toBe('-')
	})

	test('seconds ago', () => {
		const now = Math.floor(Date.now() / 1000)
		expect(timeAgo(now - 30)).toBe('30s ago')
	})

	test('minutes ago', () => {
		const now = Math.floor(Date.now() / 1000)
		expect(timeAgo(now - 120)).toBe('2m ago')
	})

	test('hours ago', () => {
		const now = Math.floor(Date.now() / 1000)
		expect(timeAgo(now - 7200)).toBe('2h ago')
	})

	test('days ago', () => {
		const now = Math.floor(Date.now() / 1000)
		expect(timeAgo(now - 172800)).toBe('2d ago')
	})

	test('now (0s diff) shows 0s ago', () => {
		const now = Math.floor(Date.now() / 1000)
		expect(timeAgo(now)).toBe('0s ago')
	})
})

describe('formatTimestamp', () => {
	test('null returns dash', () => {
		expect(formatTimestamp(null)).toBe('-')
	})

	test('numeric seconds', () => {
		// 2024-01-15 00:00:00 UTC
		expect(formatTimestamp(1705276800)).toBe('2024-01-15 00:00:00')
	})

	test('ms string', () => {
		expect(formatTimestamp('1705276800000')).toBe('2024-01-15 00:00:00')
	})

	test('NaN string returns dash', () => {
		expect(formatTimestamp('bad')).toBe('-')
	})
})

describe('statusColour', () => {
	test('SUCCESS → green', () => {
		expect(statusColour('SUCCESS')).toBe('green')
	})

	test('FAILURE → red', () => {
		expect(statusColour('FAILURE')).toBe('red')
	})

	test('CANCELED → red', () => {
		expect(statusColour('CANCELED')).toBe('red')
	})

	test('STARTED → cyan', () => {
		expect(statusColour('STARTED')).toBe('cyan')
	})

	test('QUEUED → yellow', () => {
		expect(statusColour('QUEUED')).toBe('yellow')
	})

	test('unknown status → gray', () => {
		expect(statusColour('WHATEVER')).toBe('gray')
	})
})

describe('formatMetadataEntry', () => {
	const entry = (e: Partial<MetadataEntry>): MetadataEntry => ({
		label: 'x',
		description: null,
		__typename: 'TextMetadataEntry',
		...e,
	})

	test('scalar entries render on one line', () => {
		expect(formatMetadataEntry(entry({ __typename: 'IntMetadataEntry', intValue: 0 }))).toBe('x: 0')
		expect(formatMetadataEntry(entry({ __typename: 'BoolMetadataEntry', boolValue: false }))).toBe(
			'x: false',
		)
		expect(formatMetadataEntry(entry({ text: 'hi' }))).toBe('x: hi')
	})

	test('multi-line text is indented under the label', () => {
		expect(formatMetadataEntry(entry({ text: 'a\nb' }), '  ')).toBe('  x:\n    a\n    b')
	})

	test('json is pretty-printed, invalid json passes through', () => {
		const j = entry({ __typename: 'JsonMetadataEntry', jsonString: '{"a":1}' })
		expect(formatMetadataEntry(j)).toBe('x:\n  {\n    "a": 1\n  }')
		expect(formatMetadataEntry({ ...j, jsonString: 'nope' })).toBe('x:\n  nope')
	})

	test('table lists columns then records', () => {
		const t = entry({
			__typename: 'TableMetadataEntry',
			table: {
				schema: { columns: [{ name: 'a', type: 'string' }] } as never,
				records: ['{"a":"1"}'],
			},
		})
		expect(formatMetadataEntry(t)).toBe('x:\n  columns: a\n  {"a":"1"}')
	})

	test('unknown types fall back to label and typename', () => {
		expect(formatMetadataEntry(entry({ __typename: 'PipelineRunMetadataEntry' }))).toBe(
			'x: (PipelineRunMetadataEntry)',
		)
	})
})
