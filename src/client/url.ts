/** Split HTTP Basic credentials out of a URL's userinfo section. */

export interface SplitUrl {
	/** The URL with any userinfo removed. */
	url: string
	/** Credentials as "user:password", or undefined when the URL carried none. */
	basicAuth?: string
}

/**
 * Separate `user:pass@` userinfo from a URL.
 *
 * Parsed by hand rather than with `new URL`, which rejects the raw `#`, `%` and
 * `/` that turn up in generated passwords. Percent-encoded userinfo is decoded
 * so an encoded and a literal password produce the same header.
 */
export function splitBasicAuth(url: string): SplitUrl {
	const match = /^(https?:\/\/)([^/@]+)@(.*)$/.exec(url)
	if (!match) return { url }
	const [, scheme, userinfo, rest] = match
	return { url: `${scheme}${rest}`, basicAuth: decodeUserinfo(userinfo) }
}

function decodeUserinfo(userinfo: string): string {
	try {
		return decodeURIComponent(userinfo)
	} catch {
		// A lone '%' is not valid percent-encoding; take the credentials literally.
		return userinfo
	}
}
