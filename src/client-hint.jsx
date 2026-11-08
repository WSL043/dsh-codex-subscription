import { Tooltip } from './client-primitives.jsx'

/** Keep the setting's own label as the help target. */
export function SettingsLabel({ children, description, as: Tag = 'span', className = 'codexSubscriptionPreferenceLabel', openOnClick = true, ...props }) {
  const hasHelp = typeof description === 'string' && description.trim() !== ''
  const label = <Tag {...props} className={className || undefined} tabIndex={hasHelp ? 0 : undefined}>{children}</Tag>
  return hasHelp ? <Tooltip label={description} side="bottom" maxWidth={360} openOnClick={openOnClick}>{label}</Tooltip> : label
}

/** Live status, blocked reasons and confirmations remain readable without opening help. */
export function Hint({ children, as: Tag = 'span' }) {
  return <Tag className="codexSubscriptionPreferenceHint">{children}</Tag>
}
