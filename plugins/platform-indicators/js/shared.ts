export interface Settings {
	memberList: boolean
	profile: boolean
	messages: boolean
	dmList: boolean
	/** Whether your own devices are shown */
	showSelf: boolean
}

export type Location = Exclude<keyof Settings, 'showSelf'>

export const DefaultSettings: Settings = {
	memberList: true,
	profile: true,
	messages: true,
	dmList: true,
	showSelf: false,
}

/** In the order their icons are shown */
export const Platforms = ['desktop', 'mobile', 'web', 'embedded', 'vr'] as const

export type Platform = (typeof Platforms)[number]

export type Status = 'online' | 'idle' | 'dnd' | 'offline' | 'invisible'

/** Discord's own icons */
export const PlatformIcons: Record<Platform, string> = {
	desktop: 'ScreenIcon',
	mobile: 'MobilePhoneIcon',
	web: 'GlobeEarthIcon',
	embedded: 'GameControllerIcon',
	vr: 'VrHeadsetIcon',
}

export const PlatformLabels: Record<Platform, string> = {
	desktop: 'Desktop',
	mobile: 'Mobile',
	web: 'Web',
	embedded: 'Console',
	vr: 'VR',
}

/** Color tokens of each status, see `Tokens.default.colors` */
export const StatusColorTokens: Record<Status, string> = {
	online: 'ICON_STATUS_ONLINE',
	idle: 'ICON_STATUS_IDLE',
	dnd: 'ICON_STATUS_DND',
	offline: 'ICON_STATUS_OFFLINE',
	invisible: 'ICON_STATUS_OFFLINE',
}

export function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value)
}
