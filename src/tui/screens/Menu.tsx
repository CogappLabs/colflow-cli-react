import { Box, Text, useInput } from 'ink'
import { useState } from 'react'

export type MenuChoice =
	| 'runs'
	| 'assets'
	| 'jobs'
	| 'sensors'
	| 'es-check'
	| 'reload'
	| 'quit'

interface MenuItem {
	choice: MenuChoice
	label: string
	hint: string
	enabled: boolean
}

const ITEMS: MenuItem[] = [
	{ choice: 'runs', label: 'Runs', hint: 'browse recent runs + drill into assets', enabled: true },
	{
		choice: 'assets',
		label: 'Assets',
		hint: 'browse all assets, materialisation + stale status',
		enabled: true,
	},
	{ choice: 'jobs', label: 'Jobs', hint: 'list all jobs in the repository', enabled: true },
	{
		choice: 'sensors',
		label: 'Sensors',
		hint: 'list sensors with status + recent ticks',
		enabled: true,
	},
	{ choice: 'es-check', label: 'Elasticsearch', hint: '(TODO)', enabled: false },
	{
		choice: 'reload',
		label: 'Reload Dagster',
		hint: 'reload the code location after editing python',
		enabled: true,
	},
	{ choice: 'quit', label: 'Quit', hint: '', enabled: true },
]

interface Props {
	onSelect: (choice: MenuChoice) => void
}

export function Menu({ onSelect }: Props) {
	const [cursor, setCursor] = useState(0)

	useInput((input, key) => {
		if (input === 'q' || key.escape) {
			onSelect('quit')
			return
		}
		if (key.upArrow) {
			setCursor((c) => {
				let n = c
				do {
					n = (n - 1 + ITEMS.length) % ITEMS.length
				} while (!ITEMS[n]!.enabled && n !== c)
				return n
			})
		}
		if (key.downArrow) {
			setCursor((c) => {
				let n = c
				do {
					n = (n + 1) % ITEMS.length
				} while (!ITEMS[n]!.enabled && n !== c)
				return n
			})
		}
		if (key.return) {
			const item = ITEMS[cursor]
			if (item?.enabled) onSelect(item.choice)
		}
	})

	const maxLabel = Math.max(...ITEMS.map((i) => i.label.length))

	return (
		<Box flexDirection="column">
			<Text bold>What would you like to do?</Text>
			<Box marginTop={1} flexDirection="column">
				{ITEMS.map((item, i) => {
					const selected = i === cursor
					const dim = !item.enabled
					return (
						<Box key={item.choice}>
							<Box width={2}>
								<Text color="cyan">{selected ? '›' : ' '}</Text>
							</Box>
							<Box width={maxLabel + 2}>
								<Text color={selected ? 'cyan' : undefined} dimColor={dim} bold={selected}>
									{item.label}
								</Text>
							</Box>
							<Box flexGrow={1}>
								<Text dimColor>{item.hint}</Text>
							</Box>
						</Box>
					)
				})}
			</Box>
		</Box>
	)
}
