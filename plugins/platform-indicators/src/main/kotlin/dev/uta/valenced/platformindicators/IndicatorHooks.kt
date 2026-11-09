package dev.uta.valenced.platformindicators

import android.graphics.drawable.Drawable
import android.os.Handler
import android.os.Looper
import android.view.View
import android.view.ViewGroup
import android.widget.TextView
import app.valenced.xposed.api.DexFinder
import de.robv.android.xposed.XC_MethodHook
import de.robv.android.xposed.XposedBridge
import org.json.JSONObject
import java.lang.reflect.Field
import java.lang.reflect.Modifier
import java.util.WeakHashMap
import kotlin.math.roundToInt

private const val MESSAGE_VIEW = "com.discord.chat.presentation.message.MessageView"
private const val MESSAGE = "com.discord.chat.bridge.Message"
private const val CHAT_LIST_VIEW_MANAGER = "com.discord.chat.presentation.list.ChatListViewManager"

/** LRU cache of users' indicators. More than JS tracks, which removes the ones it forgets. */
private const val CACHE_CAPACITY = 2000

private const val GAP_DP = 2f
private const val PADDING_DP = 4f

/** A platform and the user's status on it, such as `desktop` and `online`. */
private typealias Indicator = Pair<String, String>

/** Adds the indicators JS sends to the end of the author's name in chat messages. */
internal class IndicatorHooks(dexFinder: DexFinder) {
    private val indicators = object : LinkedHashMap<Long, List<Indicator>>(256, 0.75f, true) {
        override fun removeEldestEntry(eldest: MutableMap.MutableEntry<Long, List<Indicator>>) = size > CACHE_CAPACITY
    }

    /** Icons and colors JS resolved from Discord's assets and theme. */
    private class Config(val icons: Map<String, String>, val colors: Map<String, Int>)

    @Volatile
    private var config: Config? = null

    /** What a name shows, and the drawable padding it had before. */
    private class Shown(val key: String, val drawable: Drawable, val padding: Int)

    // Main thread only
    private val bound = WeakHashMap<TextView, Long>()
    private val shown = WeakHashMap<TextView, Shown>()
    private val iconIds = HashMap<String, Int>()
    private var ids: ViewIds? = null

    private val mainHandler = Handler(Looper.getMainLooper())

    private val authorIdField = dexFinder.classLoader.loadClass(MESSAGE).getDeclaredField("authorId")
        .apply { isAccessible = true }

    /** `UserId` is a value class around the ID, boxed as the field is nullable. */
    private val userIdValue: Field? = authorIdField.type.declaredFields
        .firstOrNull { !Modifier.isStatic(it.modifiers) && it.type == Long::class.javaPrimitiveType }
        ?.apply { isAccessible = true }

    private val chatListView = dexFinder.classLoader.loadClass(CHAT_LIST_VIEW_MANAGER).declaredMethods
        .single { it.name == "setFloatingChatInputEnabled" && !it.isBridge }
        .parameterTypes[0]

    private val unhooks: List<XC_MethodHook.Unhook>

    init {
        val setMessage = dexFinder.findMethod {
            matcher {
                declaredClass(MESSAGE_VIEW)
                usingEqStrings("message", "messageContext", "eventHandler")
            }
        } ?: error("MessageView.setMessage not found")

        unhooks = listOf(XposedBridge.hookMethod(setMessage, object : XC_MethodHook() {
            override fun afterHookedMethod(param: MethodHookParam) {
                bind(param.thisObject as ViewGroup, param.args[0])
            }
        }))
    }

    /** IDs of the message views Discord's binding holds. R8 merged the binding classes, the IDs keep their names. */
    private class ViewIds(view: View) {
        val header = view.idOf("header")
        val authorName = view.idOf("author_name")
    }

    private fun bind(view: ViewGroup, message: Any?) {
        val ids = ids ?: ViewIds(view).also { ids = it }
        val header = view.childWithId(ids.header) ?: return
        val author = header.findViewById<TextView>(ids.authorName) ?: return

        // Only messages that start a group show their author
        val userId = if (author.visibility == View.VISIBLE) message?.let(::authorId) else null
        if (userId == null) bound.remove(author) else bound[author] = userId
        render(author, userId)
    }

    private fun authorId(message: Any): Long? = when (val id = authorIdField.get(message)) {
        null -> null
        is Long -> id
        else -> userIdValue?.getLong(id)
    }

    /** Stores indicators from JS, and updates names already showing their users. */
    fun put(json: String) {
        val updates = JSONObject(json).let { obj ->
            obj.keys().asSequence().associate { key ->
                val list = obj.getJSONArray(key)
                key.toLong() to List(list.length()) {
                    val entry = list.getJSONArray(it)
                    entry.getString(0) to entry.getString(1)
                }
            }
        }

        synchronized(indicators) {
            for ((userId, list) in updates) {
                if (list.isEmpty()) indicators.remove(userId) else indicators[userId] = list
            }
        }

        mainHandler.post {
            val rendered = bound.mapNotNull { (view, userId) ->
                if (userId in updates && render(view, userId)) view else null
            }
            relayout(rendered)
        }
    }

    /** Sets the icons and colors, and redraws names already showing indicators. */
    fun setConfig(json: String) {
        val obj = JSONObject(json)
        val icons = obj.getJSONObject("icons").let { o -> o.keys().asSequence().associateWith(o::getString) }
        val colors = obj.getJSONObject("colors").let { o -> o.keys().asSequence().associateWith { o.getLong(it).toInt() } }
        config = Config(icons, colors)

        mainHandler.post {
            // Drawn again even when the same indicators are shown
            for (view in shown.keys.toList()) restore(view)
            relayout(bound.mapNotNull { (view, userId) -> if (render(view, userId)) view else null })
        }
    }

    fun clear() {
        synchronized(indicators) { indicators.clear() }
        mainHandler.post { relayout(shown.keys.toList().onEach(::restore)) }
    }

    fun dispose() {
        for (unhook in unhooks) unhook.unhook()
        synchronized(indicators) { indicators.clear() }
        mainHandler.post {
            relayout(shown.keys.toList().onEach(::restore))
            bound.clear()
        }
    }

    /**
     * Shows the indicators of [userId] at the end of [view], or removes them.
     * Returns whether anything changed, as the chat list has to be laid out again then.
     */
    private fun render(view: TextView, userId: Long?): Boolean {
        val list = userId?.let { synchronized(indicators) { indicators[it] } }.orEmpty()
        val config = config
        val current = shown[view]

        if (list.isEmpty() || config == null) {
            if (current == null) return false
            restore(view)
            return true
        }

        val size = view.textSize.roundToInt()
        val key = "$size:" + list.joinToString(",") { (platform, status) -> "$platform:$status" }
        // The drawables can be reset by Discord when it binds the name
        if (current?.key == key && view.compoundDrawablesRelative[2] === current.drawable) return false

        val density = view.resources.displayMetrics.density
        val drawable = IndicatorDrawable(
            list.mapNotNull { (platform, status) -> icon(view, config, platform, status) },
            size,
            (GAP_DP * density).roundToInt(),
        )

        val drawables = view.compoundDrawablesRelative
        val padding = current?.padding ?: view.compoundDrawablePadding
        view.setCompoundDrawablesRelative(drawables[0], drawables[1], drawable, drawables[3])
        view.compoundDrawablePadding = (PADDING_DP * density).roundToInt()
        shown[view] = Shown(key, drawable, padding)
        return true
    }

    /** Removes the indicators from [view], if it still shows them. */
    private fun restore(view: TextView) {
        val current = shown.remove(view) ?: return
        val drawables = view.compoundDrawablesRelative
        if (drawables[2] !== current.drawable) return
        view.setCompoundDrawablesRelative(drawables[0], drawables[1], null, drawables[3])
        view.compoundDrawablePadding = current.padding
    }

    /** Discord's icon for [platform], tinted with the color of [status]. */
    private fun icon(view: View, config: Config, platform: String, status: String): Drawable? {
        val name = config.icons[platform] ?: return null
        val color = config.colors[status] ?: return null

        @Suppress("DiscouragedApi")
        val id = iconIds.getOrPut(name) { view.resources.getIdentifier(name, "drawable", view.context.packageName) }
        if (id == 0) return null

        return view.context.getDrawable(id)?.mutate()?.apply { setTint(color) }
    }

    /**
     * Lays out the chat lists of [views] again, so their names fit their indicators.
     *
     * React Native ignores layout requests from native views, Discord does this after its own updates too
     * (`ChatListView.measureAndLayout`). Views with a pending layout request are measured again.
     */
    private fun relayout(views: List<View>) {
        val lists = views.mapNotNullTo(HashSet()) { view ->
            generateSequence(view.parent) { it.parent }.firstOrNull(chatListView::isInstance) as View?
        }

        for (list in lists) {
            list.measure(
                View.MeasureSpec.makeMeasureSpec(list.width, View.MeasureSpec.EXACTLY),
                View.MeasureSpec.makeMeasureSpec(list.height, View.MeasureSpec.EXACTLY),
            )
            list.layout(list.left, list.top, list.right, list.bottom)
        }
    }
}

@Suppress("DiscouragedApi")
private fun View.idOf(name: String) = resources.getIdentifier(name, "id", context.packageName)

// Not findViewById, as nested messages (such as replies) have views with the same IDs
private fun ViewGroup.childWithId(id: Int): View? =
    (0 until childCount).asSequence().map(::getChildAt).firstOrNull { it.id == id }
