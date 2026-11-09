import { Constants } from '@valenced/discord/common/constants'
import { getModules } from '@valenced/modules/finders'
import {
	createFilterGenerator,
	withProps,
} from '@valenced/modules/finders/filters'
import { insteadJSX } from '@valenced/react/jsx-runtime'
import { cloneElement, isValidElement, memo } from 'react'
import PlatformIndicators from './indicators'
import { isRecord } from './shared'
import type { PluginApi } from '@valenced/plugins/types'
import type {
	FC,
	MemoExoticComponent,
	ReactElement,
	JSX as ReactJSX,
	ReactNode,
} from 'react'
import type { Settings } from './shared'

type AnyElement = ReactElement<Record<string, any>>
type Memo<P> = MemoExoticComponent<FC<P>> & {
	type: FC<P>
	compare: ((a: P, b: P) => boolean) | null
}

interface UserRowProps {
	user?: { id: string }
}

interface DisplayNameProps {
	user?: { id: string }
}

interface ChannelContentProps {
	channel?: { type: number }
}

const MemoSymbol = Symbol.for('react.memo')
const Key = 'uta-a.platform-indicators'

/** Matches `memo(function Name() {})` by the wrapped component's name */
const withMemoName = createFilterGenerator<[name: string]>(
	([name], _, exports) =>
		isRecord(exports) &&
		exports.$$typeof === MemoSymbol &&
		typeof exports.type === 'function' &&
		exports.type.name === name,
	([name]) => `${Key}.memoName(${name})`,
)

export function setupViews({ cleanup }: PluginApi<{ jsonStorage: Settings }>) {
	cleanup(
		// Rows in member lists, and other lists of users
		getModules(withMemoName('UserRow'), UserRow => {
			const Patched = patchMemo(
				UserRow as unknown as Memo<UserRowProps>,
				(rendered, { user }) => {
					// The label holds the name, then the crown and tags
					if (!user?.id || !isElement(rendered)) return rendered
					const label = rendered.props.label
					if (!isElement(label)) return rendered

					return cloneElement(rendered, {
						label: cloneElement(label, {
							children: insertAt(
								label.props.children,
								1,
								<PlatformIndicators
									key={Key}
									userId={user.id}
									location="memberList"
								/>,
							),
						}),
					})
				},
			)

			cleanup(
				insteadJSX(UserRow, ([, props, key], jsx) => jsx(Patched, props, key)),
			)
		}),
		// The name on user profiles
		getModules(
			withProps<{
				DisplayName: FC<DisplayNameProps>
				UserTagAndPronouns: unknown
			}>('DisplayName', 'UserTagAndPronouns'),
			({ DisplayName }) => {
				const Patched = patchRender(DisplayName, (rendered, { user }) => {
					// A pressable row of the name, then a chevron when there is one
					if (!user?.id || !isElement(rendered)) return rendered

					return cloneElement(rendered, {
						children: insertAt(
							rendered.props.children,
							1,
							<PlatformIndicators
								key={Key}
								userId={user.id}
								location="profile"
								size="md"
							/>,
						),
					})
				})

				cleanup(
					insteadJSX(DisplayName, ([, props, key], jsx) =>
						jsx(Patched, props, key),
					),
				)
			},
		),
		// Rows in the list of DMs
		getModules(withMemoName('MessagesItemChannelContent'), Content => {
			const Patched = patchMemo(
				Content as unknown as Memo<ChannelContentProps>,
				(rendered, { channel }) => {
					if (channel?.type !== (Constants as any).ChannelTypes.DM)
						return rendered

					// The name is followed by the server tag
					return insertAfterName(rendered, userId => (
						<PlatformIndicators key={Key} userId={userId} location="dmList" />
					))
				},
			)

			cleanup(
				insteadJSX(Content, ([, props, key], jsx) => jsx(Patched, props, key)),
			)
		}),
	)
}

function isElement(node: unknown): node is AnyElement {
	return isValidElement(node)
}

function insertAt(children: ReactNode, index: number, node: ReactNode) {
	const list = Array.isArray(children) ? [...children] : [children]
	list.splice(index, 0, node)
	return list
}

/** Puts what `make` returns after the first `UsernameWithEffects` in the tree */
function insertAfterName(
	node: ReactNode,
	make: (userId: string) => ReactNode,
): ReactNode {
	if (!isElement(node)) return node

	const { children } = node.props
	const list = Array.isArray(children) ? children : [children]
	const index = list.findIndex(
		child =>
			isElement(child) &&
			typeof child.props.userId === 'string' &&
			'userName' in child.props,
	)

	if (index >= 0)
		return cloneElement(node, {
			children: insertAt(
				list,
				index + 1,
				make((list[index] as AnyElement).props.userId),
			),
		})

	for (const [i, child] of list.entries()) {
		const patched = insertAfterName(child, make)
		if (patched !== child)
			return cloneElement(node, {
				children: list.map((item, j) => (i === j ? patched : item)),
			})
	}

	return node
}

type RenderPatch<P> = (rendered: ReactNode, props: P) => ReactNode

const patched = new WeakMap<object, FC<any>>()

/**
 * A component rendering `Component` and passing its output through `patch`.
 * `Component` is called directly, so its hooks belong to the wrapper.
 */
function patchRender<P extends object>(
	Component: FC<P>,
	patch: RenderPatch<P>,
): FC<P> {
	const cached = patched.get(Component)
	if (cached) return cached

	const Patched: FC<P> = props =>
		patch(Component(props) as ReactNode, props) as ReactJSX.Element

	Object.defineProperty(Patched, 'name', {
		value: `Patched(${Component.name || 'Component'})`,
	})
	patched.set(Component, Patched)
	return Patched
}

function patchMemo<P extends object>(
	component: Memo<P>,
	patch: RenderPatch<P>,
) {
	const cached = patched.get(component)
	if (cached) return cached

	const Patched = memo(
		patchRender(component.type, patch),
		component.compare ?? undefined,
	) as unknown as FC<P>
	patched.set(component, Patched)
	return Patched
}
