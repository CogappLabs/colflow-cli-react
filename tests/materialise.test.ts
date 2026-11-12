import { describe, expect, test } from 'bun:test'
import type { GraphQLClient } from 'graphql-request'
import { launchAssetRun } from '../src/client/index.ts'

describe('launchAssetRun', () => {
	test('sends an assetSelection, not stepKeys', async () => {
		const calls: { vars: Record<string, unknown> }[] = []
		const client = {
			request: async (_q: string, vars: Record<string, unknown> = {}) => {
				calls.push({ vars })
				if ('params' in vars)
					return { launchRun: { __typename: 'LaunchRunSuccess', run: { runId: 'r1' } } }
				return {
					repositoriesOrError: { nodes: [{ name: '__repository__', location: { name: 'loc' } }] },
				}
			},
		} as unknown as GraphQLClient
		const runId = await launchAssetRun(client, [['asset_a'], ['asset_b']], {})
		expect(runId).toBe('r1')
		const params = calls.find((c) => 'params' in c.vars)?.vars.params as Record<string, unknown>
		expect(params.stepKeys).toBeUndefined()
		expect(params.selector).toEqual({
			jobName: '__ASSET_JOB',
			repositoryName: '__repository__',
			repositoryLocationName: 'loc',
			assetSelection: [{ path: ['asset_a'] }, { path: ['asset_b'] }],
		})
		expect(params.runConfigData).toEqual({})
	})
})
