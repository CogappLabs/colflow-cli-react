import { fetchInstanceHealth, fetchSchedules, fetchSensors, makeClient } from '../client/index.ts'
import { timeAgo } from '../format/index.ts'

interface Opts {
	url: string
	auth?: string
	json: boolean
}

interface Problem {
	area: 'daemon' | 'location' | 'sensor' | 'schedule'
	name: string
	detail: string
}

/**
 * A stopped daemon or a failing tick produces no failed run, so nothing else in
 * colflow surfaces it. This is the one command that answers "is anything
 * quietly broken" without a run to look at.
 */
export async function runDoctor({ url, auth, json }: Opts): Promise<void> {
	const client = makeClient({ url, auth })
	const [health, sensors, schedules] = await Promise.all([
		fetchInstanceHealth(client),
		fetchSensors(client).catch(() => []),
		fetchSchedules(client).catch(() => []),
	])

	const problems: Problem[] = []

	for (const d of health.daemons) {
		if (!d.required || d.healthy) continue
		const err = d.lastHeartbeatErrors[0]?.message.split('\n')[0]
		const beat = d.lastHeartbeatTime ? timeAgo(d.lastHeartbeatTime) : 'never'
		problems.push({
			area: 'daemon',
			name: d.daemonType,
			detail: err ?? `no heartbeat since ${beat}`,
		})
	}

	for (const l of health.locations) {
		if (l.loadStatus === 'LOADED' && !l.error) continue
		problems.push({
			area: 'location',
			name: l.name,
			detail: l.error?.message.split('\n')[0] ?? l.loadStatus,
		})
	}

	// A RUNNING instigator whose every recent tick failed still reports RUNNING.
	for (const s of sensors) {
		const failed = s.ticks.filter((t) => t.status === 'FAILURE')
		if (s.ticks.length === 0 || failed.length < s.ticks.length) continue
		problems.push({
			area: 'sensor',
			name: s.name,
			detail: `${failed.length} consecutive failed ticks: ${
				failed[0]?.error?.message.split('\n')[0] ?? 'no error message'
			}`,
		})
	}

	for (const s of schedules) {
		const failed = s.ticks.filter((t) => t.status === 'FAILURE')
		if (s.ticks.length === 0 || failed.length < s.ticks.length) continue
		problems.push({
			area: 'schedule',
			name: s.name,
			detail: `${failed.length} consecutive failed ticks: ${
				failed[0]?.error?.message.split('\n')[0] ?? 'no error message'
			}`,
		})
	}

	if (json) {
		process.stdout.write(
			`${JSON.stringify(
				{
					healthy: problems.length === 0,
					problems,
					daemons: health.daemons,
					locations: health.locations,
				},
				null,
				2,
			)}\n`,
		)
		if (problems.length > 0) process.exitCode = 1
		return
	}

	process.stdout.write('Daemons\n')
	for (const d of health.daemons) {
		const mark = d.healthy ? 'ok  ' : d.required ? 'FAIL' : 'off '
		const beat = d.lastHeartbeatTime ? timeAgo(d.lastHeartbeatTime) : 'never'
		process.stdout.write(`  ${mark} ${d.daemonType.padEnd(24)} last heartbeat: ${beat}\n`)
	}

	process.stdout.write('\nCode locations\n')
	for (const l of health.locations) {
		const mark = l.loadStatus === 'LOADED' && !l.error ? 'ok  ' : 'FAIL'
		process.stdout.write(`  ${mark} ${l.name.padEnd(24)} ${l.loadStatus}\n`)
	}

	process.stdout.write(`\nSensors: ${sensors.length}   Schedules: ${schedules.length}\n`)

	if (problems.length === 0) {
		process.stdout.write('\nNo problems found\n')
		return
	}
	process.stdout.write(`\n${problems.length} problem(s):\n`)
	for (const p of problems) {
		process.stdout.write(`  [${p.area}] ${p.name}: ${p.detail}\n`)
	}
	process.exitCode = 1
}
