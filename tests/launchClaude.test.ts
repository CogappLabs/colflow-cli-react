import { describe, expect, test } from 'bun:test'
import { buildErrorPrompt } from '../src/tui/launchClaude.ts'

describe('buildErrorPrompt', () => {
	test('includes asset key in intro line', () => {
		const p = buildErrorPrompt({ assetKey: 'my_asset' })
		expect(p).toContain('my_asset')
	})

	test('includes runId when provided', () => {
		const p = buildErrorPrompt({ assetKey: 'a', runId: 'run-abc-123' })
		expect(p).toContain('run-abc-123')
	})

	test('omits Run ID section when runId missing', () => {
		const p = buildErrorPrompt({ assetKey: 'a' })
		expect(p).not.toContain('**Run ID:**')
	})

	test('includes stepKey when provided', () => {
		const p = buildErrorPrompt({ assetKey: 'a', stepKey: 'compute_step' })
		expect(p).toContain('compute_step')
	})

	test('omits Step section when stepKey missing', () => {
		const p = buildErrorPrompt({ assetKey: 'a' })
		expect(p).not.toContain('**Step:**')
	})

	test('includes failureMessage when provided', () => {
		const p = buildErrorPrompt({ assetKey: 'a', failureMessage: 'Something went wrong' })
		expect(p).toContain('Something went wrong')
	})

	test('omits Error section when failureMessage missing', () => {
		const p = buildErrorPrompt({ assetKey: 'a' })
		expect(p).not.toContain('**Error:**')
	})

	test('includes cause messages', () => {
		const p = buildErrorPrompt({
			assetKey: 'a',
			causes: [{ message: 'Root cause here', stack: null }],
		})
		expect(p).toContain('Root cause here')
		expect(p).toContain('**Caused by:**')
	})

	test('includes cause stack when present', () => {
		const p = buildErrorPrompt({
			assetKey: 'a',
			causes: [{ message: 'cause msg', stack: 'File "x.py", line 10' }],
		})
		expect(p).toContain('File "x.py", line 10')
	})

	test('omits Caused by section when no causes', () => {
		const p = buildErrorPrompt({ assetKey: 'a', causes: [] })
		expect(p).not.toContain('**Caused by:**')
	})

	test('includes failureStack when provided', () => {
		const p = buildErrorPrompt({ assetKey: 'a', failureStack: 'Traceback (most recent...)' })
		expect(p).toContain('Traceback (most recent...)')
		expect(p).toContain('**Stack trace:**')
	})

	test('omits Stack trace section when failureStack is null', () => {
		const p = buildErrorPrompt({ assetKey: 'a', failureStack: null })
		expect(p).not.toContain('**Stack trace:**')
	})

	test('full prompt includes all sections', () => {
		const p = buildErrorPrompt({
			assetKey: 'my_asset',
			runId: 'run-xyz',
			stepKey: 'my_asset_step',
			failureMessage: 'ValueError: bad value',
			failureStack: 'File "x.py", line 5',
			causes: [{ message: 'cause', stack: null }],
		})
		expect(p).toContain('my_asset')
		expect(p).toContain('run-xyz')
		expect(p).toContain('my_asset_step')
		expect(p).toContain('ValueError: bad value')
		expect(p).toContain('**Stack trace:**')
		expect(p).toContain('**Caused by:**')
	})

	test('ends with actionable instruction line', () => {
		const p = buildErrorPrompt({ assetKey: 'a' })
		expect(p).toContain('root cause')
	})
})
