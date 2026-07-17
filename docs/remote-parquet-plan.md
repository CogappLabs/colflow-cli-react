# Reading remote parquet outputs

When a collection-flow Dagster instance runs on a remote box (e.g. a Dokploy
deployment), its Dagster commands work over the GraphQL API, and `--basic-auth`
covers a Basic-auth proxy in front of it. The parquet outputs are a separate
problem: the Dagster API does not serve asset files. This is how `inspect`,
`sample`, and `duckdb` read a remote box's parquet.

## Approach: Dagster materialisation path, rewritten to S3

A deployed Dagster writes parquet to a mounted path (e.g.
`/mnt/s3files/output/editorial_raw.parquet`) which syncs to the assets bucket
(`s3://famsf-cf-assets/output/editorial_raw.parquet`). Dagster's materialisation
metadata reports the written path, so the CLI resolves an asset to S3 like this:

1. Query Dagster for the asset's latest materialisation `path` metadata
   (`fetchAssetMaterializationPath`, `src/client/index.ts`), which returns the
   mount path.
2. Rewrite the mount prefix to an S3 URI using two config values,
   `COLFLOW_MOUNT_ROOT` and `COLFLOW_S3_BUCKET` (`mountPathToS3Uri`,
   `src/s3/index.ts`): strip the mount root, prepend `s3://<bucket>`. A path
   already expressed as `s3://` passes through; a path outside the mount root
   returns null so the caller falls back to local reading.
3. Read the S3 object. Credentials come from the AWS default chain (the
   developer's SSO session / `AWS_PROFILE`); the CLI configures no keys.

## What was built

- `src/s3/index.ts` — S3 helpers: `isS3Uri`, `parseS3Uri`, `mountPathToS3Uri`,
  `asyncBufferFromS3` (a hyparquet `AsyncBuffer` backed by a HeadObject for the
  length and ranged GetObject for slices, so only metadata + needed row groups
  are fetched), and `listS3Parquets` (ListObjectsV2 over a prefix).
- `src/client/index.ts` — `fetchAssetMaterializationPath`, the GraphQL lookup:
  ```graphql
  {
    assetsOrError(assetKeys: [{ path: ["<asset>"] }]) {
      ... on AssetConnection {
        nodes {
          key { path }
          assetMaterializations(limit: 1) {
            metadataEntries { label ... on PathMetadataEntry { path } }
          }
        }
      }
    }
  }
  ```
  It returns the `path` for the entry whose label is `path`, or null.
- `src/parquet/index.ts` — `readMetadata` / `sampleRows` open through a shared
  `openBuffer` that picks `asyncBufferFromS3` for `s3://` paths and
  `asyncBufferFromFile` otherwise.
- `src/project/index.ts` — `resolveParquetSource` ties it together: an `s3://`
  argument is used as-is; a bare asset name with `COLFLOW_S3_BUCKET` set is
  looked up and rewritten; anything else falls back to the local
  `resolveParquetPath`.
- `src/commands/inspect.ts` / `sample.ts` — call `resolveParquetSource` and skip
  the local `existsSync` guard for `s3://` results.
- `src/commands/duckdb.ts` — for an `s3://` `COLFLOW_ASSET_ROOT`, lists the
  prefix via `listS3Parquets`, loads `httpfs`, creates a persistent S3 secret
  (`PROVIDER credential_chain`) so the separate `duckdb --ui` process inherits
  credentials, and mounts each object as a view reading from S3.

## Config

- `--mount-root` / `COLFLOW_MOUNT_ROOT` — the deploy mount prefix, e.g.
  `/mnt/s3files`.
- `--s3-bucket` / `COLFLOW_S3_BUCKET` — the assets bucket, e.g.
  `famsf-cf-assets`.
- `COLFLOW_ASSET_ROOT` — for `duckdb`, may be an `s3://bucket/prefix` URI.

## Fallback: SSH bridge

If remote inspection is ever needed against a box whose outputs are not on S3,
the CLI could SSH to the box and run the reader there. That adds SSH handling and
cannot drive `duckdb --ui` remotely, so it is a stopgap, not the target.
