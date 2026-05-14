import { Spinner } from '@inkjs/ui'
import { Box, Text, useInput } from 'ink'
import { useState } from 'react'
import { makeClient, reloadLocation, type ReloadResult } from '../../client/index.ts'

interface Props {
	url: string
	auth?: string
	onBack: () => void
}

type Phase =
	| { kind: 'confirm' }
	| { kind: 'reloading' }
	| { kind: 'done'; result: ReloadResult }
	| { kind: 'error'; message: string }

export function Reload({ url, auth, onBack }: Props) {
	const [phase, setPhase] = useState<Phase>({ kind: 'confirm' })

	useInput((input, key) => {
		if (phase.kind === 'reloading') return
		if (input === 'q' || key.escape || key.leftArrow) {
			onBack()
			return
		}
		if (phase.kind === 'confirm') {
			if (input === 'y' || key.return) {
				setPhase({ kind: 'reloading' })
				const client = makeClient({ url, auth })
				reloadLocation(client)
					.then((result) => setPhase({ kind: 'done', result }))
					.catch((e: Error) =>
						setPhase({ kind: 'error', message: String(e?.message ?? e) }),
					)
			}
			if (input === 'n') onBack()
			return
		}
		if ((phase.kind === 'done' || phase.kind === 'error') && key.return) {
			onBack()
		}
	})

	return (
		<Box flexDirection="column">
			<Text bold color="cyan">
				Reload Dagster code location
			</Text>
			<Box marginTop={1}>
				{phase.kind === 'confirm' && (
					<Box flexDirection="column">
						<Text color="yellow">Reload now?</Text>
						<Text>
							<Text color="green">y</Text> confirm · <Text color="red">n</Text> cancel
						</Text>
					</Box>
				)}
				{phase.kind === 'reloading' && <Spinner label="Reloading..." />}
				{phase.kind === 'done' && (
					<Box flexDirection="column">
						<Text
							color={phase.result.status === 'LOADED' ? 'green' : 'yellow'}
						>
							{phase.result.status}
						</Text>
						{phase.result.message && <Text>{phase.result.message}</Text>}
						<Text dimColor>↵ back</Text>
					</Box>
				)}
				{phase.kind === 'error' && (
					<Box flexDirection="column">
						<Text color="red">Reload failed: {phase.message}</Text>
						<Text dimColor>↵ back</Text>
					</Box>
				)}
			</Box>
		</Box>
	)
}
