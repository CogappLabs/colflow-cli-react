import { Box, Text, useInput } from 'ink'
import { useEffect, useState } from 'react'
import { resolveUrl } from '../../es/index.ts'
import { onWorkspaceResolved } from '../../project/workspace.ts'
import { t } from '../i18n/en.ts'

export type MenuChoice =
	| 'runs'
	| 'assets'
	| 'jobs'
	| 'sensors'
	| 'es-check'
	| 'duckdb'
	| 'reload'
	| 'quit'

interface MenuItem {
	choice: MenuChoice
	label: string
	hint: string
	enabled: boolean
}

function buildItems(): MenuItem[] {
	const esConfigured =
		!!process.env.ELASTICSEARCH_URL ||
		!!process.env.ELASTICO_URL ||
		!!process.env.ELASTICSEARCH_API_KEY ||
		!!process.env.ELASTICO_API_KEY
	const esHint = esConfigured
		? `${t.menu.items.esCheck.hint} (${resolveUrl(undefined)})`
		: 'set ELASTICSEARCH_URL or ELASTICO_URL to enable'
	return [
		{ choice: 'runs', label: t.menu.items.runs.label, hint: t.menu.items.runs.hint, enabled: true },
		{
			choice: 'assets',
			label: t.menu.items.assets.label,
			hint: t.menu.items.assets.hint,
			enabled: true,
		},
		{ choice: 'jobs', label: t.menu.items.jobs.label, hint: t.menu.items.jobs.hint, enabled: true },
		{
			choice: 'sensors',
			label: t.menu.items.sensors.label,
			hint: t.menu.items.sensors.hint,
			enabled: true,
		},
		{
			choice: 'es-check',
			label: t.menu.items.esCheck.label,
			hint: esHint,
			enabled: esConfigured,
		},
		{
			choice: 'duckdb',
			label: t.menu.items.duckdb.label,
			hint: t.menu.items.duckdb.hint,
			enabled: true,
		},
		{
			choice: 'reload',
			label: t.menu.items.reload.label,
			hint: t.menu.items.reload.hint,
			enabled: true,
		},
		{ choice: 'quit', label: t.menu.items.quit.label, hint: t.menu.items.quit.hint, enabled: true },
	]
}

interface Props {
	onSelect: (choice: MenuChoice) => void
	notice?: { ok: boolean; message: string } | null
}

export function Menu({ onSelect, notice }: Props) {
	const [cursor, setCursor] = useState(0)
	const [, bump] = useState(0)
	useEffect(() => onWorkspaceResolved(() => bump((n) => n + 1)), [])
	const ITEMS = buildItems()

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
				} while (!ITEMS[n]?.enabled && n !== c)
				return n
			})
		}
		if (key.downArrow) {
			setCursor((c) => {
				let n = c
				do {
					n = (n + 1) % ITEMS.length
				} while (!ITEMS[n]?.enabled && n !== c)
				return n
			})
		}
		// Menu already wraps via modulo above.
		if (key.return) {
			const item = ITEMS[cursor]
			if (item?.enabled) onSelect(item.choice)
		}
	})

	const maxLabel = Math.max(...ITEMS.map((i) => i.label.length))

	return (
		<Box flexDirection="column">
			<Text bold>{t.menu.title}</Text>
			{notice && (
				<Box marginTop={1}>
					<Text color={notice.ok ? 'green' : 'red'}>{notice.message}</Text>
				</Box>
			)}
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
