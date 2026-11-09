import { AssetsRegistry, getAssetIdByName } from '@valenced/assets'
import { Tokens } from '@valenced/discord/common/tokens'
import { Stores } from '@valenced/discord/flux'
import { getModules } from '@valenced/modules/finders'
import { withName } from '@valenced/modules/finders/filters'
import { after } from '@valenced/patcher'
import { getErrorStack } from '@valenced/utils/error'
import { processColor } from 'react-native'
import { clearIndicators, putIndicators, setNativeConfig } from './native'
import { deserialize, snapshot, subscribe } from './presence'
import { PlatformIcons, Platforms, StatusColorTokens } from './shared'
import type { DiscordModules } from '@valenced/discord/types'
import type { PluginApi } from '@valenced/plugins/types'
import type { IndicatorUpdates, NativeConfig } from './native'
import type { Settings, Status } from './shared'

interface RowManager {
	prototype: {
		generate(row: unknown): MessageRow
	}
}

interface MessageRow {
	type?: number
	message?: {
		authorId?: string
	}
}

const MessageRowType = 1
/** Authors native was told about. The oldest are dropped. */
const MaxTracked = 1000
/** Presences change often in big servers, so changes are sent together */
const RefreshDelay = 250

type ThemeStore = DiscordModules.Flux.Store<{ theme: string }>

/** Chat messages are drawn natively, which shows the indicators JS sends it. */
export function setupMessages({
	cleanup,
	plugin,
}: PluginApi<{ jsonStorage: Settings }>) {
	// What native shows for each author, see `serialize`
	const sent = new Map<string, string>()
	let refreshTimeout: ReturnType<typeof setTimeout> | undefined

	function track(userId: string) {
		const known = sent.get(userId)
		if (known !== undefined) {
			// Most recently seen last
			sent.delete(userId)
			sent.set(userId, known)
			return
		}

		const updates: IndicatorUpdates = {}
		const value = snapshot(userId, 'messages')
		sent.set(userId, value)
		if (value) updates[userId] = deserialize(value)

		if (sent.size > MaxTracked) {
			const oldest = sent.keys().next().value!
			if (sent.get(oldest)) updates[oldest] = []
			sent.delete(oldest)
		}

		if (Object.keys(updates).length) putIndicators(updates)
	}

	function refresh() {
		refreshTimeout = undefined

		const updates: IndicatorUpdates = {}
		for (const [userId, known] of sent) {
			const value = snapshot(userId, 'messages')
			if (value === known) continue
			sent.set(userId, value)
			updates[userId] = deserialize(value)
		}

		if (Object.keys(updates).length) putIndicators(updates)
	}

	function sendConfig() {
		const theme = (Stores.ThemeStore as ThemeStore).theme
		const { colors, internal } = Tokens.default
		const argb = (token: string) =>
			processColor(
				internal.resolveSemanticColor(
					theme,
					(colors as Record<string, unknown>)[token],
				),
			) as number

		setNativeConfig({
			icons: Object.fromEntries(
				Platforms.map(platform => [
					platform,
					androidResourceName(PlatformIcons[platform]),
				]),
			) as NativeConfig['icons'],
			colors: Object.fromEntries(
				Object.entries(StatusColorTokens).map(([status, token]) => [
					status,
					argb(token),
				]),
			) as Record<Status, number>,
		})
	}

	sendConfig()
	Stores.ThemeStore.addChangeListener(sendConfig)

	cleanup(
		() => {
			Stores.ThemeStore.removeChangeListener(sendConfig)
			clearTimeout(refreshTimeout)
			sent.clear()
			clearIndicators()
		},
		subscribe(() => {
			refreshTimeout ??= setTimeout(refresh, RefreshDelay)
		}),
		// modules/messages/native/renderer/RowGenerator.tsx
		getModules(withName<RowManager>('RowManager'), ({ prototype }) => {
			cleanup(
				after(prototype, 'generate', row => {
					const authorId =
						row?.type === MessageRowType ? row.message?.authorId : undefined
					if (!authorId) return row

					try {
						track(authorId)
					} catch (e) {
						plugin.reportError(
							`Failed to get the devices of ${authorId}: ${getErrorStack(e)}`,
						)
					}

					return row
				}),
			)
		}),
	)
}

/** See `getAndroidResourceIdentifier` in `@react-native/assets-registry/path-support`. */
function androidResourceName(assetName: string) {
	const { httpServerLocation = '', name } = AssetsRegistry.getAssetByID(
		getAssetIdByName(assetName)!,
	) as { httpServerLocation?: string; name: string }

	return `${httpServerLocation.replace(/^\//, '')}/${name}`
		.toLowerCase()
		.replace(/\//g, '_')
		.replace(/[^a-z0-9_]/g, '')
		.replace(/^(?:assets|assetsunstable_path)_/, '')
}
