import { callNativeMethodSync } from '@valenced/modules/native'
import type { Indicators } from './presence'
import type { Platform, Status } from './shared'

export interface NativeConfig {
	/** Android drawable resource names of the platform icons */
	icons: Record<Platform, string>
	/** ARGB colors of each status in the current theme */
	colors: Record<Status, number>
}

/** User ID to their indicators, an empty list removes them */
export type IndicatorUpdates = Record<string, Indicators>

/** Synchronous so the indicators are stored before the rows that show them reach native. */
export function putIndicators(updates: IndicatorUpdates) {
	callNativeMethodSync('uta-a.platform-indicators.put', [
		JSON.stringify(updates),
	])
}

export function setNativeConfig(config: NativeConfig) {
	callNativeMethodSync('uta-a.platform-indicators.config', [
		JSON.stringify(config),
	])
}

export function clearIndicators() {
	callNativeMethodSync('uta-a.platform-indicators.clear', [])
}

declare module '@valenced/modules/native' {
	interface NativeMethods {
		'uta-a.platform-indicators.put': [[json: string], null]
		'uta-a.platform-indicators.config': [[json: string], null]
		'uta-a.platform-indicators.clear': [[], null]
	}
}
