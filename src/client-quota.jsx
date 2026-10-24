import { useEffect, useSyncExternalStore } from 'react'
import { selectModelQuotaWindows } from './sidebar-quota.js'
import { recoveryCall } from './client-recovery.js'
import { QUICK_QUOTA_REFRESH_EVENT } from './client-shared.js'
import { createUsageController } from './usage-controller.js'

const controllers = new WeakMap()
export function quotaUsageController(rpc) {
  if (!controllers.has(rpc)) controllers.set(rpc, createUsageController({
    request: async force => {
      const account = await recoveryCall(rpc, 'status')
      return account?.authenticated === true ? recoveryCall(rpc, 'usage', { force }) : undefined
    },
    visible: () => document.visibilityState !== 'hidden',
    onUpdate: ({ force }) => { if (force) window.dispatchEvent(new Event('codex-subscription:usage-loaded')) },
    listen: ({ invalidate, wake }) => {
      window.addEventListener(QUICK_QUOTA_REFRESH_EVENT, invalidate)
      document.addEventListener('visibilitychange', wake)
      return () => { window.removeEventListener(QUICK_QUOTA_REFRESH_EVENT, invalidate); document.removeEventListener('visibilitychange', wake) }
    },
  }))
  return controllers.get(rpc)
}

export function useQuotaUsage(rpc, enabled) {
  const controller = quotaUsageController(rpc)
  const snapshot = useSyncExternalStore(controller.subscribe, controller.getSnapshot)
  useEffect(() => enabled ? controller.retain() : undefined, [controller, enabled])
  return { ...snapshot, refresh: controller.refresh }
}

export function useQuickQuota(rpc, enabled, model) {
  const snapshot = useQuotaUsage(rpc, enabled)
  return enabled ? selectModelQuotaWindows(snapshot.usage, model).map(window => ({ ...window, fetchedAt: snapshot.usage.fetchedAt, now: snapshot.now, refreshError: snapshot.error !== undefined })) : undefined
}
