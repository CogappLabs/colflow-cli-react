import { useScreenSize } from 'fullscreen-ink'
import { Box, Text, useInput } from 'ink'
import { useState } from 'react'

interface Props {
	title: string
	body: string
	onBack: () => void
}

export function Details({ title, body, onBack }: Props) {
	const { height } = useScreenSize()
	const [scroll, setScroll] = useState(0)
	// Reserve: header(2) + title(1) + footer(2) + margins(2)
	const visible = Math.max(5, height - 7)
	const lines = body.split(/\r?\n/)
	const maxScroll = Math.max(0, lines.length - visible)

	useInput((input, key) => {
		if (input === 'q' || key.escape || key.leftArrow) {
			onBack()
			return
		}
		if (key.upArrow) setScroll((s) => Math.max(0, s - 1))
		if (key.downArrow) setScroll((s) => Math.min(maxScroll, s + 1))
		if (key.pageUp) setScroll((s) => Math.max(0, s - visible))
		if (key.pageDown) setScroll((s) => Math.min(maxScroll, s + visible))
		if (input === 'g') setScroll(0)
		if (input === 'G') setScroll(maxScroll)
	})

	const slice = lines.slice(scroll, scroll + visible)
	const fits = lines.length <= visible
	const atBottom = !fits && scroll >= maxScroll
	const atTop = !fits && scroll === 0

	void title
	return (
		<Box flexDirection="column">
			<Box justifyContent="flex-end">
				<Text dimColor>
					{fits
						? `${lines.length} lines`
						: `${scroll + 1}-${scroll + slice.length}/${lines.length}${
								atTop ? ' TOP' : atBottom ? ' END' : ''
							}`}
				</Text>
			</Box>
			<Box flexDirection="column" marginTop={1}>
				{slice.map((line, i) => (
					<Text key={`${scroll + i}`}>{line || ' '}</Text>
				))}
			</Box>
		</Box>
	)
}
