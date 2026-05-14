/**
 * Theme + accessibility tokens.
 *
 * Rule of thumb for terminal apps that work in both dark and light themes:
 * - Default text (no color) renders in the user's terminal foreground colour
 *   and is always high-contrast against their background.
 * - Avoid `dimColor` and explicit `color="gray"` on data: both render mid-grey
 *   that fails WCAG against either dark OR light backgrounds.
 * - Use `bold` for labels (visual weight, no contrast loss).
 * - Reserve dimColor + gray for: footer hint bars, scroll indicators where the
 *   reduced contrast is the point.
 * - Semantic ANSI colours (cyan/green/red/yellow) are themed by the user's
 *   terminal palette and adapt to dark/light automatically.
 */

export const colour = {
	primary: 'cyan',
	success: 'green',
	warning: 'yellow',
	error: 'red',
} as const

export type Colour = (typeof colour)[keyof typeof colour]
