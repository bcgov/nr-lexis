import { useCallback, useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'

const DETAIL_TAB_STATE_KEY = 'lexisDetailTab'

type DetailTabValue = string | number

type UseReloadPreservedTabOptions<TTab extends DetailTabValue> = {
  tabs: readonly TTab[]
  defaultTab: TTab
  initialTab?: TTab
}

const asNavigationState = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}

const restoredTab = <TTab extends DetailTabValue>(
  navigationState: Record<string, unknown>,
  tabs: readonly TTab[],
): TTab | undefined => {
  const candidate = navigationState[DETAIL_TAB_STATE_KEY]
  return tabs.find((tab) => tab === candidate)
}

export const useReloadPreservedTab = <TTab extends DetailTabValue>({
  tabs,
  defaultTab,
  initialTab,
}: UseReloadPreservedTabOptions<TTab>): readonly [TTab, (tab: TTab) => void] => {
  const navigate = useNavigate()
  const location = useLocation()
  const navigationState = useMemo(() => asNavigationState(location.state), [location.state])
  const restored = restoredTab(navigationState, tabs)
  const [selection, setSelection] = useState<{ path: string; tab: TTab }>(() => ({
    path: location.pathname,
    tab: initialTab ?? restored ?? defaultTab,
  }))
  const selectedTab =
    selection.path === location.pathname ? selection.tab : (initialTab ?? restored ?? defaultTab)

  const selectTab = useCallback(
    (tab: TTab) => {
      setSelection({ path: location.pathname, tab })
      navigate(
        {
          pathname: location.pathname,
          search: location.search,
          hash: location.hash,
        },
        {
          replace: true,
          state: {
            ...navigationState,
            [DETAIL_TAB_STATE_KEY]: tab,
          },
        },
      )
    },
    [location.hash, location.pathname, location.search, navigate, navigationState],
  )

  return [selectedTab, selectTab]
}
