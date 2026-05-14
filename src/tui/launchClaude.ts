import { spawn } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

interface LaunchOpts {
	cwd: string
	prompt: string
}

/**
 * Spawn a new terminal window running `claude` with `cwd` and a seeded prompt.
 * Detached so the TUI session is unaffected.
 *
 * macOS: osascript -> Terminal.app (or iTerm if available).
 * Linux: x-terminal-emulator / gnome-terminal / konsole / xterm in that order.
 * Fallback: write prompt to /tmp file and instruct the user to open it.
 */
export function launchClaude({ cwd, prompt }: LaunchOpts): { ok: boolean; message: string } {
	// Persist prompt to a tmp file so we don't need to escape multi-line content
	// through shell argv. Pass via `--append-system-prompt-file` or pipe to stdin.
	const promptFile = join(tmpdir(), `colflow-claude-${Date.now()}.txt`)
	writeFileSync(promptFile, prompt)

	const platform = process.platform
	if (platform === 'darwin') {
		// Use whichever terminal launched the TUI. TERM_PROGRAM is set by Apple Terminal,
		// iTerm, Ghostty, etc. Fallback: Terminal.app.
		const termProgram = process.env.TERM_PROGRAM ?? 'Apple_Terminal'
		const cmd = `cd ${shellQuote(cwd)} && cat ${shellQuote(promptFile)} | claude`
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
		return { ok: true, message: `Opened ${termProgram} with claude in ${cwd}` }
	}
	if (platform === 'linux') {
		const candidates = ['x-terminal-emulator', 'gnome-terminal', 'konsole', 'xterm']
		const cmd = `cd ${shellQuote(cwd)} && cat ${shellQuote(promptFile)} | claude; bash`
		for (const term of candidates) {
			try {
				const child = spawn(term, ['-e', 'bash', '-lc', cmd], {
					detached: true,
					stdio: 'ignore',
				})
				child.unref()
				return { ok: true, message: `Opened ${term} with claude in ${cwd}` }
			} catch {}
		}
		return {
			ok: false,
			message: `No terminal emulator found. Prompt written to ${promptFile}`,
		}
	}
	return {
		ok: false,
		message: `Unsupported platform ${platform}. Prompt written to ${promptFile}`,
	}
}

function shellQuote(s: string): string {
	return `'${s.replace(/'/g, `'\\''`)}'`
}

/** Quote a string for AppleScript: wrap in double quotes, escape backslash + double-quote. */
function appleQuote(s: string): string {
	return `"${s.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`
}

/**
 * Build a Markdown prompt seeded with run/asset/failure context for claude.
 */
export function buildErrorPrompt(args: {
	assetKey: string
	runId?: string
	stepKey?: string
	failureMessage?: string
	failureStack?: string | null
	causes?: { message: string; stack: string | null }[]
}): string {
	const lines: string[] = [
		`I'm investigating a failure in my Dagster asset \`${args.assetKey}\`.`,
		'',
	]
	if (args.runId) lines.push(`**Run ID:** ${args.runId}`)
	if (args.stepKey) lines.push(`**Step:** ${args.stepKey}`)
	if (args.runId || args.stepKey) lines.push('')
	if (args.failureMessage) {
		lines.push('**Error:**', '```', args.failureMessage, '```', '')
	}
	for (const c of args.causes ?? []) {
		lines.push('**Caused by:**', '```', c.message, '```', '')
		if (c.stack) lines.push('```', c.stack, '```', '')
	}
	if (args.failureStack) {
		lines.push('**Stack trace:**', '```', args.failureStack, '```', '')
	}
	lines.push(
		'Please help me understand the root cause and propose a fix.',
		'The asset definition lives in `src/<package>/defs/assets/`.',
	)
	return lines.join('\n')
}
