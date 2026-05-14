import { useScreenSize } from 'fullscreen-ink'

/**
 * Returns a window into a list that keeps `cursor` visible.
 * `reserved`: rows to subtract from terminal height for chrome (header, footer, table header, etc.).
 */
export function useViewportWindow(total: number, cursor: number, reserved = 8) {
	const { height } = useScreenSize()
	const visible = Math.max(3, height - reserved)
	if (total <= visible) return { start: 0, end: total, visible }
	let start = Math.max(0, cursor - Math.floor(visible / 2))
	const end = Math.min(total, start + visible)
	start = Math.max(0, end - visible)
	return { start, end, visible }
}
