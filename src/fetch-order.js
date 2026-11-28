export const FETCH_ORDER_FIELD = 'fetchProviderOrder'
export const FETCH_CHAIN_PROVIDER_ID = 'codex-subscription-fetch-chain'
export const FETCH_STOP = '__stop__'
export const FETCH_ORDER_RELOAD_REQUIRED = 'fetch-order-reload-required'

export function isCompositeFetchProvider(id) {
  return id === 'codex-subscription-fetch-fallback' || id === FETCH_CHAIN_PROVIDER_ID
}

function isAtomicProviderId(id) {
  return typeof id === 'string' && id.length > 0 && id.length <= 256
    && id.trim() === id && !/[\u0000-\u001f\u007f-\u009f]/u.test(id)
    && id !== FETCH_STOP && !isCompositeFetchProvider(id)
}

function copyFetchOrder(value, allowEmpty) {
  if (!Array.isArray(value) || value.length > 100 || (!allowEmpty && value.length === 0)) {
    throw new Error('Invalid fetch provider order: expected a non-empty array of at most 100 provider ids')
  }
  const order = []
  const seen = new Set()
  for (const id of value) {
    if (!isAtomicProviderId(id) || seen.has(id)) {
      throw new Error('Invalid fetch provider order: provider ids must be valid, atomic and unique')
    }
    order.push(id)
    seen.add(id)
  }
  return order
}

function registeredProviderIds(providerIds) {
  if (!Array.isArray(providerIds)) throw new Error('Invalid fetch provider directory: expected an array')
  return [...new Set(providerIds.filter(isAtomicProviderId))]
}

function checkIndex(order, index) {
  if (!Number.isInteger(index) || index < 0 || index > order.length) {
    throw new Error('Invalid fetch provider row index')
  }
}

export function validateFetchOrder(value) {
  return copyFetchOrder(value, false)
}

export function changeFetchOrder(order, index, next, providerIds) {
  const result = copyFetchOrder(order, true)
  checkIndex(result, index)
  const registered = registeredProviderIds(providerIds)
  if (next === FETCH_STOP) {
    if (index === 0) throw new Error('The first fetch provider row cannot stop')
    return result.slice(0, index)
  }
  if (!registered.includes(next)) throw new Error('Unknown or invalid fetch provider selection')
  const previousIndex = result.indexOf(next)
  if (index === result.length) {
    if (previousIndex !== -1) throw new Error('The trailing fetch provider row cannot select a used provider')
    if (result.length === 100) throw new Error('Fetch provider order cannot exceed 100 providers')
    result.push(next)
  } else {
    if (previousIndex !== -1) result[previousIndex] = result[index]
    result[index] = next
  }
  return result
}

export function fetchOrderOptions(order, index, providerIds) {
  const current = copyFetchOrder(order, true)
  checkIndex(current, index)
  const registered = registeredProviderIds(providerIds)
  if (index < current.length) return index === 0 ? registered : [...registered, FETCH_STOP]
  if (current.length === 0) return registered
  if (current.length === 100) return []
  const unused = registered.filter(id => !current.includes(id))
  return unused.length ? [...unused, FETCH_STOP] : []
}
