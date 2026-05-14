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

interface Props<T> {
	columns: Column<T>[]
	data: T[]
	cursor?: number // highlight row at this index in cyan
	cursorMarker?: string // marker char for cursor row (default '›')
}

/**
 * Reusable column-based table for the TUI. Auto-sizes columns by header +
 * content width unless an explicit width is given. The last `flex: true`
 * column expands to fill remaining width with truncation.
 *
 * Highlights `cursor` row in cyan and adds a marker column. Pass undefined
 * cursor for a non-interactive table.
 */
export function Table<T>({ columns, data, cursor, cursorMarker = '›' }: Props<T>) {
	const showCursor = cursor !== undefined

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
			{columns.map((col, i) => {
				const isLast = i === columns.length - 1 && col.flex
				return (
					<Box
						key={`h-${col.header}`}
						width={isLast ? undefined : computed[i]! + 2}
						flexGrow={isLast ? 1 : 0}
						flexShrink={0}
					>
						<Text bold>{col.header}</Text>
					</Box>
				)
			})}
		</Box>
	)

	const renderRow = (row: T, idx: number) => {
		const isSelected = showCursor && idx === cursor
		return (
			<Box key={`r-${idx}`}>
				{showCursor && (
					<Box width={2} flexShrink={0}>
						<Text color="cyan">{isSelected ? cursorMarker : ' '}</Text>
					</Box>
				)}
				{columns.map((col, i) => {
					const cell = col.render(row, idx)
					const isLast = i === columns.length - 1 && col.flex
					return (
						<Box
							key={`r-${idx}-${i}`}
							width={isLast ? undefined : computed[i]! + 2}
							flexGrow={isLast ? 1 : 0}
							flexShrink={0}
						>
							<Text
								color={isSelected ? 'cyan' : cell.colour}
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

	return (
		<Box flexDirection="column">
			{renderHeader()}
			{data.map((row, idx) => renderRow(row, idx))}
		</Box>
	)
}
