import { spawn } from 'node:child_process'

interface LaunchOpts {
	cwd: string
	command: string
	label?: string
}

/**
 * Spawn a new terminal window running an arbitrary shell command.
 * Detached so the TUI session is unaffected. Mirrors launchClaude.ts.
 */
export function launchTerminal({ cwd, command, label }: LaunchOpts): {
	ok: boolean
	message: string
} {
	const tag = label ?? command
	const platform = process.platform
	if (platform === 'darwin') {
		const termProgram = process.env.TERM_PROGRAM ?? 'Apple_Terminal'
		const cmd = `cd ${shellQuote(cwd)} && ${command}`
		const script =
			termProgram === 'iTerm.app'
				? `tell application "iTerm"
	activate
	set newWindow to (create window with default profile)
	tell current session of newWindow
		write text ${appleQuote(cmd)}
	end tell
end tell`
				: `tell application "Terminal"
	activate
	do script ${appleQuote(cmd)}
end tell`
		const result = Bun.spawnSync(['osascript', '-e', script])
		if (result.exitCode !== 0) {
			const err = result.stderr.toString().trim() || 'osascript failed'
			return { ok: false, message: `Failed to open ${termProgram}: ${err}` }
		}
		return { ok: true, message: `Opened ${termProgram} with ${tag} in ${cwd}` }
	}
	if (platform === 'linux') {
		const candidates = ['x-terminal-emulator', 'gnome-terminal', 'konsole', 'xterm']
		const cmd = `cd ${shellQuote(cwd)} && ${command}; bash`
		for (const term of candidates) {
			try {
				const child = spawn(term, ['-e', 'bash', '-lc', cmd], {
					detached: true,
					stdio: 'ignore',
				})
				child.unref()
				return { ok: true, message: `Opened ${term} with ${tag} in ${cwd}` }
			} catch {}
		}
		return { ok: false, message: `No terminal emulator found.` }
	}
	return { ok: false, message: `Unsupported platform ${platform}.` }
}

export function shellQuote(s: string): string {
	return `'${s.replace(/'/g, `'\\''`)}'`
}

export function appleQuote(s: string): string {
	return `"${s.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`
}
