import { existsSync } from 'node:fs'
import { dirname } from 'node:path'
import { fetchWorkspaceLocation, makeClient, type WorkspaceLocation } from '../client/index.ts'
import { detect, type Project } from './index.ts'

interface Resolved {
	location: WorkspaceLocation
	projectRoot: string | null
	project: Project | null
}

let cache: Resolved | null | undefined

/**
 * Ask Dagster GraphQL where the code location lives. Returns project root
 * derived from working_directory metadata. Cached for the session.
 */
export async function resolveWorkspace(url: string, auth?: string): Promise<Resolved | null> {
	if (cache !== undefined) return cache
	try {
		const client = makeClient({ url, auth })
		const location = await fetchWorkspaceLocation(client)
		if (!location?.workingDirectory) {
			cache = null
			return null
		}
		// working_directory typically = <project>/src; walk up to find pyproject.toml
		let dir = location.workingDirectory
		for (let i = 0; i < 5; i++) {
			if (existsSync(`${dir}/pyproject.toml`)) {
				const project = detect(dir)
				cache = { location, projectRoot: dir, project }
				return cache
			}
			const parent = dirname(dir)
			if (parent === dir) break
			dir = parent
		}
		cache = { location, projectRoot: location.workingDirectory, project: null }
		return cache
	} catch {
		cache = null
		return null
	}
}

export function clearWorkspaceCache(): void {
	cache = undefined
}
