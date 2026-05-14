import { Box, Text } from 'ink'

export interface Cell {
	text: string
	colour?: string
	bold?: boolean
	dim?: boolean
}

export interface Column<T> {
	header: string
	width?: number // fixed width if specified
	flex?: boolean // last/expanding column
	render: (row: T, index: number) => Cell
}

export interface Viewport {
	start: number
	end: number
	visible: number
	total: number
}

interface Props<T> {
	columns: Column<T>[]
	data: T[]
	cursor?: number // highlight row at this index in cyan
	cursorMarker?: string // marker char for cursor row (default '›')
	viewport?: Viewport // when set, slices data internally and shows scroll indicator
	selected?: Set<number> // row indices marked as selected
	selectedMarker?: string // char for selected rows (default '✓')
}

/**
 * Reusable column-based table for the TUI. Auto-sizes columns by header +
 * content width unless an explicit width is given. The last `flex: true`
 * column expands to fill remaining width with truncation.
 *
 * Highlights `cursor` row in cyan and adds a marker column. Pass undefined
 * cursor for a non-interactive table.
 *
 * Optional `viewport` prop slices `data` internally and appends a dim scroll
 * position indicator when total > visible.
 *
 * Optional `selected` prop renders an extra column (after cursor marker)
 * showing `selectedMarker` (default `✓`) in cyan for selected row indices.
 */
export function Table<T>({
	columns,
	data,
	cursor,
	cursorMarker = '›',
	viewport,
	selected,
	selectedMarker = '✓',
}: Props<T>) {
	const showCursor = cursor !== undefined
	const showSelected = selected !== undefined

	// Determine the slice to render
	const slice = viewport ? data.slice(viewport.start, viewport.end) : data
	const indexOffset = viewport ? viewport.start : 0

	// Compute widths once: for each column with no explicit width, take max
	// of header length and rendered text length across all rows.
	const computed = columns.map((col, i) => {
		if (col.width !== undefined) return col.width
		const max = Math.max(
			col.header.length,
			...data.map((row, idx) => columns[i]?.render(row, idx).text.length ?? 0),
		)
		return max
	})

	const renderHeader = () => (
		<Box>
			{showCursor && <Box width={2} flexShrink={0} />}
			{showSelected && <Box width={3} flexShrink={0} />}
			{columns.map((col, i) => {
				const isLast = i === columns.length - 1 && col.flex
				return (
					<Box
						key={`h-${col.header}`}
						width={isLast ? undefined : (computed[i] ?? 0) + 2}
						flexGrow={isLast ? 1 : 0}
						flexShrink={0}
					>
						<Text bold>{col.header}</Text>
					</Box>
				)
			})}
		</Box>
	)

	const renderRow = (row: T, sliceIdx: number) => {
		const idx = sliceIdx + indexOffset
		const isCursor = showCursor && idx === cursor
		const isSelected = showSelected && selected.has(idx)
		return (
			<Box key={`r-${idx}`}>
				{showCursor && (
					<Box width={2} flexShrink={0}>
						<Text color="cyan">{isCursor ? cursorMarker : ' '}</Text>
					</Box>
				)}
				{showSelected && (
					<Box width={3} flexShrink={0}>
						<Text color="cyan">{isSelected ? selectedMarker : ' '}</Text>
					</Box>
				)}
				{columns.map((col, i) => {
					const cell = col.render(row, idx)
					const isLast = i === columns.length - 1 && col.flex
					return (
						<Box
							key={`r-${idx}-${col.header}`}
							width={isLast ? undefined : (computed[i] ?? 0) + 2}
							flexGrow={isLast ? 1 : 0}
							flexShrink={0}
						>
							<Text
								color={isCursor ? 'cyan' : cell.colour}
								bold={cell.bold}
								dimColor={cell.dim}
								wrap="truncate"
							>
								{cell.text}
							</Text>
						</Box>
					)
				})}
			</Box>
		)
	}

	const showScrollIndicator = viewport && viewport.total > viewport.visible

	return (
		<Box flexDirection="column">
			{renderHeader()}
			{slice.map((row, sliceIdx) => renderRow(row, sliceIdx))}
			{showScrollIndicator && (
				<Text dimColor>
					{(cursor ?? 0) + 1}/{viewport.total} {viewport.start > 0 ? '↑' : ' '}
					{viewport.end < viewport.total ? '↓' : ' '}
				</Text>
			)}
		</Box>
	)
}
