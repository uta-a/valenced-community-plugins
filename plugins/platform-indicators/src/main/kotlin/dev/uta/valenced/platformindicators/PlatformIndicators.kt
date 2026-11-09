@file:JvmName("PlatformIndicators")

package dev.uta.valenced.platformindicators

import app.valenced.bridge.asDelegate
import app.valenced.plugins.plugin
import app.valenced.xposed.api.registerNativeMethod

/** Shows the devices JS sends next to the authors of chat messages. */
@Suppress("UNUSED")
val platformIndicators = plugin {
    var hooks: IndicatorHooks? = null

    start {
        hooks = IndicatorHooks(dexFinder)

        registerNativeMethod("uta-a.platform-indicators.put") { args ->
            val json by args.asDelegate().string()
            hooks?.put(json)
            null
        }

        registerNativeMethod("uta-a.platform-indicators.config") { args ->
            val json by args.asDelegate().string()
            hooks?.setConfig(json)
            null
        }

        registerNativeMethod("uta-a.platform-indicators.clear") {
            hooks?.clear()
            null
        }
    }

    stop {
        hooks?.dispose()
        hooks = null
    }
}
