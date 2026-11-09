import { Tokens } from '@valenced/discord/common/tokens'
import { lookupGeneratedIconComponent } from '@valenced/utils/discord'
import { useSyncExternalStore } from 'react'
import { StyleSheet, View } from 'react-native'
import { deserialize, snapshot, subscribe } from './presence'
import { PlatformIcons, PlatformLabels, StatusColorTokens } from './shared'
import type { DiscordModules } from '@valenced/discord/types'
import type { Location, Platform } from './shared'

type IconSize = DiscordModules.Components.BaseIconImageProps['size']

interface Props {
	userId: string | undefined
	location: Location
	size?: IconSize
}

const styles = StyleSheet.create({
	row: {
		flexDirection: 'row',
		alignItems: 'center',
		flexShrink: 0,
		gap: 2,
	},
})

const icons = new Map<
	Platform,
	DiscordModules.Components.BaseIconImage | undefined
>()

function iconOf(platform: Platform) {
	if (!icons.has(platform))
		icons.set(platform, lookupGeneratedIconComponent(PlatformIcons[platform]))
	return icons.get(platform)
}

/** An icon for each device the user is online on, in the color of their status on it. */
export default function PlatformIndicators({
	userId,
	location,
	size = 'xs',
}: Props) {
	const value = useSyncExternalStore(subscribe, () =>
		snapshot(userId, location),
	)

	const indicators = deserialize(value)
	if (!indicators.length) return null

	const colors = Tokens.default.colors as Record<string, unknown>

	return (
		<View
			style={styles.row}
			accessible
			accessibilityLabel={indicators
				.map(([platform, status]) => `${PlatformLabels[platform]}: ${status}`)
				.join(', ')}
		>
			{indicators.map(([platform, status]) => {
				const Icon = iconOf(platform)
				return (
					Icon && (
						<Icon
							key={platform}
							size={size}
							color={colors[StatusColorTokens[status]]}
						/>
					)
				)
			})}
		</View>
	)
}
