import React from 'react'
// Presentation-only host adapters: no DSH services or account credentials.
export function Button({ variant, children, ...props }) { return <button {...props}>{children}</button> }
export function Input(props) { return <input {...props} /> }
export function Menu({ anchor }) { return anchor }
export function Tooltip({ children }) { return children }
export function useAnchoredPosition() { return {} }
export function useDismissOnOutsidePointer() {}
const Icon = () => <svg width="14" height="14" viewBox="0 0 14 14"><path d="m4 5 3 3 3-3" fill="none" stroke="currentColor" /></svg>
export const IconCheckOutline16 = Icon, IconChevronDownOutline14 = Icon, IconChevronRightOutline14 = Icon, IconChevronLeftOutline14 = Icon, IconCloseOutline16 = Icon, IconCopyOutline16 = Icon, IconDownloadOutline16 = Icon, IconEditOutline16 = Icon, IconFullscreenOutline16 = Icon
export const IconCheckOutlineRegular=Icon, IconChevronDownOutlineRegular=Icon, IconChevronRightOutlineRegular=Icon, IconChevronLeftOutlineRegular=Icon, IconCloseOutlineRegular=Icon, IconCopyOutlineRegular=Icon, IconDownloadOutlineRegular=Icon, IconEditOutlineRegular=Icon, IconFullscreenOutlineRegular=Icon
