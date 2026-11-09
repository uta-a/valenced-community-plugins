import { setupMessages } from './messages'
import { setActive, setSettings, watchPresences } from './presence'
import SettingsComponent from './settings'
import { DefaultSettings } from './shared'
import { setupViews } from './views'
import type { Settings } from './shared'

export default plugin<{ jsonStorage: Settings }>({
	jsonStorage: {
		load: true,
		default: DefaultSettings,
	},
	start(api) {
		const { cleanup, jsonStorage } = api

		const syncSettings = () =>
			setSettings({ ...DefaultSettings, ...jsonStorage.cache })
		syncSettings()

		setActive(true)
		cleanup(
			jsonStorage.subscribe(syncSettings),
			watchPresences(),
			// Shown indicators render nothing from now on, even where Discord doesn't re-render
			() => setActive(false),
		)

		setupViews(api)
		setupMessages(api)
	},
	SettingsComponent,
})
