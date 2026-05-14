import { describe, expect, test } from 'bun:test'
import type { RunDetail, RunEvent } from '../src/client/index.ts'
import { computeDiff, durationStr, extractSteps, statusOf } from '../src/diff/index.ts'

function makeEvent(stepKey: string | null, level: string, message = 'msg'): RunEvent {
	return { message, timestamp: 0, stepKey, level }
}

function makeRun(events: RunEvent[]): RunDetail {
	return {
		runId: 'r1',
		jobName: 'job',
		status: 'SUCCESS',
		startTime: null,
		endTime: null,
		stats: null,
		events,
	}
}

describe('extractSteps', () => {
	test('empty events returns empty map', () => {
		expect(extractSteps([])).toEqual(new Map())
	})

	test('events without stepKey are ignored', () => {
		const m = extractSteps([makeEvent(null, 'INFO'), makeEvent(null, 'ERROR')])
		expect(m.size).toBe(0)
	})

	test('single non-error event creates OK summary', () => {
		const m = extractSteps([makeEvent('step_a', 'INFO')])
		expect(m.get('step_a')).toEqual({ stepKey: 'step_a', hasError: false })
	})

	test('error event sets hasError', () => {
		const m = extractSteps([makeEvent('step_a', 'ERROR')])
		expect(m.get('step_a')?.hasError).toBe(true)
	})

	test('multiple events per step: later ERROR promotes hasError', () => {
		const events = [makeEvent('step_a', 'INFO'), makeEvent('step_a', 'ERROR')]
		const m = extractSteps(events)
		expect(m.get('step_a')?.hasError).toBe(true)
	})

	test('multiple events per step: stays OK when no error', () => {
		const events = [makeEvent('step_a', 'INFO'), makeEvent('step_a', 'DEBUG')]
		expect(extractSteps(events).get('step_a')?.hasError).toBe(false)
	})
})

describe('statusOf', () => {
	test('undefined returns MISSING', () => {
		expect(statusOf(undefined)).toBe('MISSING')
	})

	test('hasError false returns OK', () => {
		expect(statusOf({ stepKey: 's', hasError: false })).toBe('OK')
	})

	test('hasError true returns FAILED', () => {
		expect(statusOf({ stepKey: 's', hasError: true })).toBe('FAILED')
	})
})

describe('durationStr', () => {
	test('null start returns unknown', () => {
		expect(durationStr(null, 100)).toBe('unknown')
	})

	test('null end returns unknown', () => {
		expect(durationStr(100, null)).toBe('unknown')
	})

	test('< 60s', () => {
		expect(durationStr(1_000_000, 1_000_045)).toBe('45s')
	})

	test('> 60s formats as m and s', () => {
		expect(durationStr(1_000_000, 1_000_125)).toBe('2m 5s')
	})

	test('ms timestamps (>1e12) are handled', () => {
		// 90 seconds difference in ms
		expect(durationStr(1_700_000_000_000, 1_700_000_090_000)).toBe('1m 30s')
	})
})

describe('computeDiff', () => {
	test('identical runs produce empty diff', () => {
		const events = [makeEvent('step_a', 'INFO')]
		const run = makeRun(events)
		expect(computeDiff(run, run)).toEqual([])
	})

	test('step missing in right run appears as MISSING', () => {
		const a = makeRun([makeEvent('step_a', 'INFO')])
		const b = makeRun([])
		const diff = computeDiff(a, b)
		expect(diff).toEqual([{ step: 'step_a', left: 'OK', right: 'MISSING' }])
	})

	test('divergent status appears in diff', () => {
		const a = makeRun([makeEvent('step_a', 'INFO')])
		const b = makeRun([makeEvent('step_a', 'ERROR')])
		const diff = computeDiff(a, b)
		expect(diff).toEqual([{ step: 'step_a', left: 'OK', right: 'FAILED' }])
	})

	test('diff rows are sorted by step name', () => {
		const a = makeRun([makeEvent('z_step', 'INFO'), makeEvent('a_step', 'INFO')])
		const b = makeRun([makeEvent('z_step', 'ERROR'), makeEvent('a_step', 'ERROR')])
		const diff = computeDiff(a, b)
		expect(diff.map((r) => r.step)).toEqual(['a_step', 'z_step'])
	})
})
