export function tsToSeconds(ts: number | string | null): number | null {
	if (ts == null) return null
	const n = typeof ts === 'string' ? Number(ts) : ts
	if (!Number.isFinite(n)) return null
	return n > 1e12 ? Math.floor(n / 1000) : Math.floor(n)
}

export function timeAgo(ts: number | string | null): string {
	const secs = tsToSeconds(ts)
	if (secs == null) return '-'
	const diff = Math.floor(Date.now() / 1000) - secs
	if (diff < 60) return `${diff}s ago`
	if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
	if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
	return `${Math.floor(diff / 86400)}d ago`
}

export function formatTimestamp(ts: number | string | null): string {
	const secs = tsToSeconds(ts)
	if (secs == null) return '-'
	return new Date(secs * 1000).toISOString().replace('T', ' ').slice(0, 19)
}

export function statusColour(status: string): 'green' | 'red' | 'yellow' | 'cyan' | 'gray' {
	switch (status) {
		case 'SUCCESS':
			return 'green'
		case 'FAILURE':
		case 'CANCELED':
			return 'red'
		case 'STARTED':
		case 'STARTING':
			return 'cyan'
		case 'QUEUED':
			return 'yellow'
		default:
			return 'gray'
	}
}
