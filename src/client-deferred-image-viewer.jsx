import { useEffect, useState, useSyncExternalStore } from 'react'
import { createClientFeature } from './client-feature.js'
import { FeatureLoadStatus } from './client-feature-status.jsx'

const feature = createClientFeature(() => import('./client-image-viewer.jsx'))

export function DeferredImageViewer(props) {
  const request = useSyncExternalStore(props.service.subscribe, props.service.getSnapshot)
  return request ? <Viewer {...props} /> : null
}

function Viewer(props) {
  const snapshot = useSyncExternalStore(feature.subscribe, feature.getSnapshot)
  const [attempt, retry] = useState(0)
  useEffect(() => { void feature.load().catch(() => {}) }, [attempt])
  if (snapshot.status !== 'ready') return <div className="codexFeatureLoadNotice">
    <FeatureLoadStatus failed={snapshot.status === 'error'} onRetry={() => retry(value => value + 1)} t={props.t} />
  </div>
  const Overlay = snapshot.module.SubscriptionImageViewerOverlay
  return <><style data-plugin="dsh-codex-subscription-viewer">{snapshot.module.SUBSCRIPTION_IMAGE_VIEWER_CSS}</style><Overlay {...props} /></>
}
