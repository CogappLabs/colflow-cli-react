import { TextInput } from '@inkjs/ui'
import { Box, Text, useInput } from 'ink'
import { useEffect, useState } from 'react'
import { inspectParquet } from '../../parquet/index.ts'
import { t } from '../i18n/en.ts'

interface Props {
	parquetPath: string
	assetName: string
	onSubmit: (column: string, value: string) => void
	onBack: () => void
}

const ID_HINTS = ['id', 'ID', 'ObjectID', 'object_id', 'objectId', 'oid']

export function AssetSampleById({ parquetPath, assetName, onSubmit, onBack }: Props) {
	const [columns, setColumns] = useState<string[] | null>(null)
	const [error, setError] = useState<string | null>(null)
	const [step, setStep] = useState<'column' | 'value'>('column')
	const [column, setColumn] = useState('')
	const [defaultColumn, setDefaultColumn] = useState('')

	useEffect(() => {
		inspectParquet(parquetPath)
			.then((info) => {
				const cols = info.columns.map((c) => c.name)
				setColumns(cols)
				const guess = ID_HINTS.find((h) => cols.includes(h)) ?? cols[0] ?? ''
				setDefaultColumn(guess)
			})
			.catch((e) => setError(String(e?.message ?? e)))
	}, [parquetPath])

	useInput((_input, key) => {
		if (key.escape) onBack()
	})

	if (error)
		return (
			<Text color="red">
				{t.common.errorPrefix} {error}
			</Text>
		)
	if (!columns) return <Text dimColor>{t.assetSampleById.loading}</Text>

	return (
		<Box flexDirection="column">
			<Text bold color="cyan">
				{assetName}
			</Text>
			<Box marginTop={1} flexDirection="column">
				{step === 'column' ? (
					<>
						<Text>
							{t.assetSampleById.columnPrompt} (default <Text color="cyan">{defaultColumn}</Text>):
						</Text>
						<Box marginTop={1}>
							<Text>{'> '}</Text>
							<TextInput
								defaultValue={defaultColumn}
								suggestions={columns}
								onSubmit={(v) => {
									const col = v.trim() || defaultColumn
									setColumn(col)
									setStep('value')
								}}
							/>
						</Box>
					</>
				) : (
					<>
						<Text>
							{t.assetSampleById.valuePrompt} <Text color="cyan">{column}</Text>:
						</Text>
						<Box marginTop={1}>
							<Text>{'> '}</Text>
							<TextInput
								onSubmit={(v) => {
									if (v.trim()) onSubmit(column, v.trim())
								}}
							/>
						</Box>
					</>
				)}
			</Box>
			<Box marginTop={1}>
				<Text dimColor>{t.assetSampleById.footer}</Text>
			</Box>
		</Box>
	)
}
