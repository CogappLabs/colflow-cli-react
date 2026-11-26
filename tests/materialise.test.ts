import { describe, expect, test } from 'bun:test'
import type { GraphQLClient } from 'graphql-request'
import { launchAssetRun, launchRun } from '../src/client/index.ts'
import { selectAssets } from '../src/commands/materialise.ts'

const node = (name: string, groupName: string | null) => ({ assetKey: { path: [name] }, groupName })
const nodes = [
	node('a', 'extract'),
	node('b', 'transform'),
	node('c', 'load'),
	node('d', 'load'),
	node('e', null),
]

describe('selectAssets', () => {
	test('exclude-group alone selects everything else', () => {
		expect(selectAssets(nodes, [], [], ['load'])).toEqual([['a'], ['b'], ['e']])
	})

	test('group selects its members', () => {
		expect(selectAssets(nodes, [], ['load'], [])).toEqual([['c'], ['d']])
	})

	test('names and groups combine, excluded group wins', () => {
		expect(selectAssets(nodes, ['a'], ['load'], ['load'])).toEqual([['a']])
		expect(selectAssets(nodes, ['a', 'zzz'], ['transform'], [])).toEqual([['a'], ['zzz'], ['b']])
	})

	test('unknown group throws', () => {
		expect(() => selectAssets(nodes, [], [], ['nope'])).toThrow(/Unknown group: nope/)
	})
})

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

	test('sends tags as executionMetadata, and omits it without tags', async () => {
		const sent: Record<string, unknown>[] = []
		const client = {
			request: async (_q: string, vars: Record<string, unknown> = {}) => {
				if ('params' in vars) {
					sent.push(vars.params as Record<string, unknown>)
					return { launchRun: { __typename: 'LaunchRunSuccess', run: { runId: 'r1' } } }
				}
				return {
					repositoriesOrError: { nodes: [{ name: '__repository__', location: { name: 'loc' } }] },
				}
			},
		} as unknown as GraphQLClient
		const tags = [{ key: 'famsf/notify', value: 'false' }]
		await launchAssetRun(client, [['a']], {}, tags)
		await launchRun(client, 'job', {}, tags)
		await launchRun(client, 'job')
		expect(sent[0]?.executionMetadata).toEqual({ tags })
		expect(sent[1]?.executionMetadata).toEqual({ tags })
		expect(sent[2]?.executionMetadata).toBeUndefined()
	})
})
