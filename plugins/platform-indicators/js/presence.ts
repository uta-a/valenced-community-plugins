import { Stores } from '@valenced/discord/flux'
import { DefaultSettings, Platforms } from './shared'
import type { DiscordModules } from '@valenced/discord/types'
import type { Location, Platform, Settings, Status } from './shared'

type ClientStatuses = Partial<Record<Platform, Status>>

interface Session {
	status: Status
	clientInfo: { client: Platform | 'unknown' }
}

type PresenceStore = DiscordModules.Flux.Store<{
	getClientStatus(userId: string): ClientStatuses | undefined
}>
type SessionsStore = DiscordModules.Flux.Store<{
	getSessions(): Record<string, Session> | undefined
}>
type UserStore = DiscordModules.Flux.Store<{
	getUser(id: string): { bot?: boolean } | undefined
	getCurrentUser(): { id: string } | undefined
}>

/** Devices a user is online on, and their status on each */
export type Indicators = [Platform, Status][]

/** A session with a higher one wins when you're on the same platform twice */
const StatusRanks: Partial<Record<Status, number>> = {
	online: 3,
	idle: 2,
	dnd: 1,
}

const listeners = new Set<() => void>()
let settings = DefaultSettings
let active = false

/** Calls `listener` when presences or settings change */
export function subscribe(listener: () => void) {
	listeners.add(listener)
	return () => {
		listeners.delete(listener)
	}
}

export function notify() {
	for (const listener of listeners) listener()
}

export function getSettings() {
	return settings
}

export function setSettings(value: Settings) {
	settings = value
	notify()
}

/** Indicators render nothing while inactive, so they disappear once the plugin stops */
export function setActive(value: boolean) {
	active = value
	notify()
}

export function getIndicators(userId: string): Indicators {
	const { UserStore, PresenceStore } = Stores as {
		UserStore: UserStore
		PresenceStore: PresenceStore
	}

	if (UserStore.getUser(userId)?.bot) return []

	const self = UserStore.getCurrentUser()?.id === userId
	if (self && !settings.showSelf) return []

	// Discord keeps no client statuses for you, only your sessions
	const statuses = self ? ownStatuses() : PresenceStore.getClientStatus(userId)
	if (!statuses) return []

	return Platforms.flatMap(platform => {
		const status = statuses[platform]
		return status ? [[platform, status] as [Platform, Status]] : []
	})
}

function ownStatuses() {
	const sessions = (Stores.SessionsStore as SessionsStore).getSessions()
	if (!sessions) return

	const statuses: ClientStatuses = {}
	for (const { status, clientInfo } of Object.values(sessions)) {
		const platform = clientInfo?.client
		if (!platform || platform === 'unknown') continue

		const known = statuses[platform]
		if (!known || (StatusRanks[status] ?? 0) > (StatusRanks[known] ?? 0))
			statuses[platform] = status
	}
	return statuses
}

/** `desktop:online,mobile:idle`, a primitive so React can compare it */
export function serialize(indicators: Indicators) {
	return indicators
		.map(([platform, status]) => `${platform}:${status}`)
		.join(',')
}

export function deserialize(value: string): Indicators {
	if (!value) return []
	return value.split(',').map(entry => entry.split(':') as [Platform, Status])
}

/** What a location should show for a user right now, see {@link serialize} */
export function snapshot(userId: string | undefined, location: Location) {
	if (!active || !userId || !settings[location]) return ''
	return serialize(getIndicators(userId))
}

/** Follows presence updates. Flux stores emit a change once they handled an event. */
export function watchPresences() {
	const stores = [Stores.PresenceStore, Stores.SessionsStore]

	for (const store of stores) store.addChangeListener(notify)
	return () => {
		for (const store of stores) store.removeChangeListener(notify)
	}
}
