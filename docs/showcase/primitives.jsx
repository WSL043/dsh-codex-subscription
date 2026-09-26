import React from 'react'
// Presentation-only host primitives. Product cards are imported from src/.
export const Button = ({variant,children,...props}) => <button {...props}>{children}</button>
export const Input = props => <input {...props}/>
export const Menu = ({anchor}) => anchor
const Chevron = () => <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="m4 6 4 4 4-4" stroke="currentColor" strokeWidth="1.5"/></svg>
export const IconChevronDownOutline14=Chevron
export const IconChevronRightOutline14=Chevron
export const IconCheckOutline16=Chevron
