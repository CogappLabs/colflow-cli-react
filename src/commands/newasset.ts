import { existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fetchAssetGraph, makeClient } from '../client/index.ts'
import { detect } from '../project/index.ts'

interface Opts {
	url: string
	auth?: string
	name?: string
	upstream?: string
	group?: string
	title?: string
	test: boolean
	dryRun: boolean
}

interface AssetData {
	name: string
	className: string
	title: string
	group: string
	kinds: string[]
	upstream: string[]
	isExtract: boolean
}

const NAME_RE = /^[a-z][a-z0-9_]*$/

function toClassName(name: string): string {
	return name
		.split('_')
		.filter((p) => p)
		.map((p) => p[0]!.toUpperCase() + p.slice(1))
		.join('')
}

function renderAsset(d: AssetData): string {
	const kindsStr = d.kinds.map((k) => `"${k}"`).join(', ')
	const upstreamArgs = d.upstream.map((u) => `\n    ${u}: pl.LazyFrame,`).join('')
	const retryImport = d.isExtract
		? '\nfrom collection_flow.support.dagster.retry_policies import api_retry_policy'
		: ''
	const retryPolicy = d.isExtract ? '\n    retry_policy=api_retry_policy,' : ''
	return `"""${d.title}."""

import dagster as dg
import pandera.polars as pa
import polars as pl
from collection_flow.support.polars.validation import validate_dataframe${retryImport}


@dg.asset(
    group_name="${d.group}",
    kinds={${kindsStr}},
    description="${d.title}.",${retryPolicy}
)
def ${d.name}(
    context: dg.AssetExecutionContext,${upstreamArgs}
) -> pl.LazyFrame:
    """${d.title}."""
    raise NotImplementedError("Implement ${d.name}")


class ${d.className}Schema(pa.DataFrameModel):
    """Schema for ${d.name}."""

    class Config:
        name = "${d.name}"


@dg.asset_check(asset="${d.name}", name="schema", blocking=True)
def ${d.name}_schema_check(df: pl.LazyFrame) -> dg.AssetCheckResult:
    """Check ${d.name} matches its schema."""
    return validate_dataframe(df, ${d.className}Schema).to_asset_check_result(
        asset_key="${d.name}",
        check_name="schema",
    )
`
}

function renderTest(name: string, pkg: string): string {
	return `import polars as pl

from ${pkg}.defs.assets.${name} import ${name}


def test_${name}_produces_lazyframe() -> None:
    """${name} returns a Polars LazyFrame."""
    # TODO: build inputs that match upstream schema
    raise NotImplementedError("Implement test for ${name}")
`
}

function listExistingAssets(dir: string): string[] {
	if (!existsSync(dir)) return []
	return readdirSync(dir)
		.filter((f) => f.endsWith('.py') && f !== '__init__.py')
		.map((f) => f.slice(0, -3))
}

export async function runNewAsset({
	url,
	auth,
	name,
	upstream,
	group,
	title,
	test,
	dryRun,
}: Opts): Promise<void> {
	const project = detect()
	if (!project) {
		process.stderr.write('No pyproject.toml found in cwd or ancestors.\n')
		process.exit(1)
	}
	if (!name) {
		process.stderr.write('Interactive mode TODO. Pass a name argument.\n')
		process.exit(2)
	}
	if (!NAME_RE.test(name)) {
		process.stderr.write(
			`name must be snake_case (lowercase, digits, underscores), got: ${name}\n`,
		)
		process.exit(1)
	}

	let finalTitle = title
	if (!finalTitle) {
		const t = name.replaceAll('_', ' ')
		finalTitle = t.length > 0 ? t[0]!.toUpperCase() + t.slice(1) : t
	}

	const finalGroup = group ?? 'transform'
	const isExtract = finalGroup === 'extract'
	const upstreams = (upstream ?? '')
		.split(',')
		.map((s) => s.trim())
		.filter(Boolean)
	const kinds = isExtract ? ['http'] : ['polars']

	// Best-effort Dagster check (currently informational only)
	if (!dryRun) {
		try {
			await fetchAssetGraph(makeClient({ url, auth }))
		} catch {}
	}

	const data: AssetData = {
		name,
		className: toClassName(name),
		title: finalTitle,
		group: finalGroup,
		kinds,
		upstream: upstreams,
		isExtract,
	}
	const body = renderAsset(data)
	const assetPath = join(project.assetsDir, `${name}.py`)

	process.stdout.write(`Project:    ${project.packageName}\n`)
	process.stdout.write(`Asset path: ${assetPath}\n`)

	if (dryRun) {
		process.stdout.write(`\n--- ${assetPath} ---\n${body}`)
		if (test) {
			const tp = join(project.root, 'tests', `test_${name}.py`)
			process.stdout.write(`--- ${tp} ---\n${renderTest(name, project.packageName)}`)
		}
		return
	}

	if (existsSync(assetPath)) {
		process.stderr.write(`asset file already exists: ${assetPath}\n`)
		process.exit(1)
	}
	mkdirSync(project.assetsDir, { recursive: true })
	writeFileSync(assetPath, body)
	process.stdout.write(`Created ${assetPath}\n`)

	if (test) {
		const testsDir = join(project.root, 'tests')
		mkdirSync(testsDir, { recursive: true })
		const tp = join(testsDir, `test_${name}.py`)
		if (existsSync(tp)) {
			process.stdout.write(`Skipped (exists): ${tp}\n`)
		} else {
			writeFileSync(tp, renderTest(name, project.packageName))
			process.stdout.write(`Created ${tp}\n`)
		}
	}
	void listExistingAssets
}
