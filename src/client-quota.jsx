import { useEffect, useState } from 'react'
import { selectModelQuotaWindows } from './sidebar-quota.js'
import { recoveryCall } from './client-recovery.js'
import { CHANNEL, QUICK_QUOTA_REFRESH_EVENT, unwrap } from './client-shared.js'
import { highestUsed, quotaRefreshMs } from './quota-cadence.js'
export function useQuickQuota(rpc, enabled, model) {
  const [quota, setQuota] = useState()
  useEffect(() => {
    if (!enabled) {
      setQuota(undefined)
      return undefined
    }
    // Do not show the previous model's quota while the new route loads.
    setQuota(undefined)
    let live = true
    let loading = false
    let timer
    let latest
    const load = async () => {
      if (loading) return
      loading = true
      try {
        const account = await recoveryCall(rpc, 'status')
        if (!live) return
        if (account?.authenticated !== true) {
          setQuota(undefined)
          return
        }
        const usage = await recoveryCall(rpc, 'usage', { force: false })
        const windows = selectModelQuotaWindows(usage, model)?.map(window => ({ ...window, fetchedAt: usage.fetchedAt }))
        latest = windows
        if (live) setQuota(windows)
      } catch {
        latest = undefined
        if (live) setQuota(undefined)
      } finally {
        loading = false
        // Look again sooner as the quota runs low.
        if (live) { window.clearTimeout(timer); timer = window.setTimeout(refresh, quotaRefreshMs(highestUsed(latest))) }
      }
    }
    const refresh = () => { void load() }
    void load()
    window.addEventListener(QUICK_QUOTA_REFRESH_EVENT, refresh)
    return () => {
      live = false
      window.clearTimeout(timer)
      window.removeEventListener(QUICK_QUOTA_REFRESH_EVENT, refresh)
    }
  }, [rpc, enabled, model])
  return quota
}
