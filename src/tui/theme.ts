/**
 * Theme tokens. Hex codes match the Claude Code palette extracted from the
 * shipped binary (Tailwind-ish, with #da7756 as the brand accent).
 *
 * Ink supports hex via `<Text color="#da7756">`. Falls back to the closest
 * 256-colour cell on terminals without truecolor — not perfect on Linux
 * console but fine for modern macOS Terminal/iTerm/Ghostty.
 *
 * Avoid `dimColor` and `color="gray"` on data: they render mid-grey on both
 * dark and light terminals (low WCAG contrast). Reserve dim for footer hints,
 * scroll counters, and "(no rows)" placeholders.
 */

export const colour = {
	// Brand accent (Claude Code coral)
	primary: '#da7756',
	// Semantic palette
	success: '#16a34a',
	warning: '#eab308',
	error: '#dc2626',
	info: '#2563eb',
	emerald: '#10b981',
	cyan: '#0891b2',
	violet: '#8b5cf6',
	lavender: '#d0b4ff',
} as const

export type Colour = (typeof colour)[keyof typeof colour]

/**
 * Map a Dagster run status to a theme colour.
 */
export function statusColourHex(status: string): string {
	switch (status) {
		case 'SUCCESS':
			return colour.success
		case 'FAILURE':
		case 'CANCELED':
			return colour.error
		case 'STARTED':
		case 'STARTING':
			return colour.cyan
		case 'QUEUED':
			return colour.warning
		default:
			return colour.lavender
	}
}
