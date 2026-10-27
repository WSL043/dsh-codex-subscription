import { ArrowPathIcon } from '@heroicons/react/24/outline'
import { Button, Tooltip } from './client-primitives.js'

export function FeatureLoadStatus({ failed, onRetry, t, compact = false }) {
  const label = t(failed ? 'featureLoadFailed' : 'featureLoading')
  return <span className="codexFeatureLoadStatus" role="status" aria-busy={!failed}>
    <Tooltip label={label}>
      <Button variant="ghost" size="sm" aria-label={label} disabled={!failed} onClick={onRetry}
        icon={<ArrowPathIcon className={failed ? 'codexFeatureRetryIcon' : 'codexFeatureLoadingIcon'} aria-hidden="true" />}>
        {compact ? null : t(failed ? 'featureRetry' : 'featureLoading')}
      </Button>
    </Tooltip>
  </span>
}
