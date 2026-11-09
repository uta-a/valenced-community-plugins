import Page from '@valenced/components/Page'
import TableRowAssetIcon from '@valenced/components/TableRowAssetIcon'
import { Design } from '@valenced/discord/design'
import { ScrollView } from 'react-native'
import { DefaultSettings } from './shared'
import type { PluginSettingsComponent } from '@valenced/plugins/types'
import type { ComponentProps } from 'react'
import type { Location, Settings } from './shared'

const { Stack, TableRowGroup, TableSwitchRow } = Design

type Props = ComponentProps<PluginSettingsComponent<{ jsonStorage: Settings }>>

const Locations: { key: Location; label: string; icon: string }[] = [
	{ key: 'memberList', label: 'Member list', icon: 'GroupIcon' },
	{ key: 'profile', label: 'User profiles', icon: 'UserIcon' },
	{ key: 'messages', label: 'Chat messages', icon: 'ChatIcon' },
	{ key: 'dmList', label: 'Direct messages list', icon: 'EnvelopeIcon' },
]

export default function SettingsComponent({
	api: { jsonStorage: storage },
}: Props) {
	const settings = { ...DefaultSettings, ...storage.use() }

	return (
		<Page>
			<ScrollView>
				<Stack spacing={24}>
					<TableRowGroup title="Show indicators in">
						{Locations.map(({ key, label, icon }) => (
							<TableSwitchRow
								key={key}
								icon={<TableRowAssetIcon name={icon} />}
								label={label}
								value={settings[key]}
								onValueChange={(value: boolean) =>
									storage.set({ [key]: value })
								}
							/>
						))}
					</TableRowGroup>
					<TableRowGroup title="Users">
						<TableSwitchRow
							icon={<TableRowAssetIcon name="LaptopPhoneIcon" />}
							label="Show your own devices"
							subLabel="Bots never show indicators."
							value={settings.showSelf}
							onValueChange={(showSelf: boolean) => storage.set({ showSelf })}
						/>
					</TableRowGroup>
				</Stack>
			</ScrollView>
		</Page>
	)
}
