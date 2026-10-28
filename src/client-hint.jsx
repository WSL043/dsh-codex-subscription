import { Tooltip } from './client-primitives.js'

/** Keep the setting's own label as the help target; reuse host hover, focus and touch behaviour. */
export function SettingsLabel({ children, description, as: Tag = 'span', className = 'codexSubscriptionPreferenceLabel', openOnClick = true, ...props }) {
  const hasHelp = typeof description === 'string' && description.trim() !== ''
  const label = <Tag {...props} className={className || undefined} tabIndex={hasHelp ? 0 : undefined}
    title={hasHelp && !Tooltip ? description : undefined} aria-description={hasHelp && !Tooltip ? description : undefined}>{children}</Tag>
  return hasHelp && Tooltip ? <Tooltip label={description} side="bottom" portal maxWidth={360} openOnClick={openOnClick}>{label}</Tooltip> : label
}

/** Live status, blocked reasons and confirmations remain readable without opening help. */
export function Hint({ children, as: Tag = 'span' }) {
  return <Tag className="codexSubscriptionPreferenceHint">{children}</Tag>
}
