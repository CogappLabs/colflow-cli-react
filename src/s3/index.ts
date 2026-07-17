import {
	GetObjectCommand,
	HeadObjectCommand,
	ListObjectsV2Command,
	S3Client,
} from '@aws-sdk/client-s3'
import type { AsyncBuffer } from 'hyparquet'

/** True for an `s3://...` URI. */
export function isS3Uri(s: string): boolean {
	return /^s3:\/\//i.test(s)
}

export interface S3Ref {
	bucket: string
	key: string
}

export function parseS3Uri(uri: string): S3Ref {
	const m = uri.match(/^s3:\/\/([^/]+)\/(.+)$/i)
	if (!m) throw new Error(`Not an s3:// object URI: ${uri}`)
	return { bucket: m[1]!, key: m[2]! }
}

/**
 * Rewrite a Dagster-reported materialisation path to an S3 URI.
 *
 * A deployed box mounts the assets bucket at `mountRoot` (e.g. `/mnt/s3files`),
 * so `<mountRoot>/output/x.parquet` maps to `s3://<bucket>/output/x.parquet`.
 * Paths already expressed as `s3://` pass through. Anything not under
 * `mountRoot` returns null so the caller can fall back to local reading.
 */
export function mountPathToS3Uri(
	path: string,
	mountRoot: string | undefined,
	bucket: string | undefined,
): string | null {
	if (isS3Uri(path)) return path
	if (!mountRoot || !bucket) return null
	const root = mountRoot.replace(/\/+$/, '')
	if (path !== root && !path.startsWith(`${root}/`)) return null
	const rest = path.slice(root.length).replace(/^\/+/, '')
	return `s3://${bucket}/${rest}`
}

let sharedClient: S3Client | null = null
function client(): S3Client {
	// Region and credentials come from the AWS default chain (env, shared config,
	// SSO). No explicit credential handling here.
	if (!sharedClient) sharedClient = new S3Client({})
	return sharedClient
}

async function streamToArrayBuffer(body: unknown): Promise<ArrayBuffer> {
	// Node/Bun return a web ReadableStream or a Node stream depending on runtime.
	const b = body as {
		transformToByteArray?: () => Promise<Uint8Array>
		arrayBuffer?: () => Promise<ArrayBuffer>
	}
	if (typeof b.transformToByteArray === 'function') {
		const bytes = await b.transformToByteArray()
		return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer
	}
	if (typeof b.arrayBuffer === 'function') return b.arrayBuffer()
	throw new Error('Unexpected S3 GetObject body type')
}

/**
 * hyparquet AsyncBuffer backed by S3 range GETs, so only the parquet metadata
 * and the row groups hyparquet asks for are fetched, not the whole object.
 */
export async function asyncBufferFromS3(uri: string): Promise<AsyncBuffer> {
	const { bucket, key } = parseS3Uri(uri)
	const s3 = client()
	const head = await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: key }))
	const byteLength = head.ContentLength ?? 0
	return {
		byteLength,
		async slice(start: number, end?: number): Promise<ArrayBuffer> {
			// hyparquet passes a half-open [start, end); HTTP Range is inclusive.
			const last = end === undefined ? byteLength - 1 : end - 1
			const range = `bytes=${start}-${last}`
			const res = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key, Range: range }))
			return streamToArrayBuffer(res.Body)
		},
	}
}

/** List `s3://bucket/prefix` object keys ending in `.parquet` (recursive). */
export async function listS3Parquets(prefixUri: string): Promise<string[]> {
	const { bucket, key } = parseS3Uri(`${prefixUri.replace(/\/+$/, '')}/x`)
	const prefix = key.replace(/x$/, '')
	const s3 = client()
	const out: string[] = []
	let token: string | undefined
	do {
		const res = await s3.send(
			new ListObjectsV2Command({ Bucket: bucket, Prefix: prefix, ContinuationToken: token }),
		)
		for (const obj of res.Contents ?? []) {
			if (obj.Key?.endsWith('.parquet')) out.push(`s3://${bucket}/${obj.Key}`)
		}
		token = res.IsTruncated ? res.NextContinuationToken : undefined
	} while (token)
	return out.sort()
}
