// Watches the requests DSH hands the adapter. When one fails, the provider keeps a
// text-free copy of what DSH asked for, next to the copy of what pi-ai received,
// so a failure that happens while DSH's messages are converted can be replayed too.
const failureOf = chunk => chunk?.reason?.kind === 'error' ? chunk.reason.failure : undefined

function observed(stream, options, provider) {
  return (async function* () {
    try {
      for await (const chunk of stream(options)) {
        const failure = failureOf(chunk)
        if (failure !== undefined && !options?.signal?.aborted) provider.noteAdapterFailure?.('failure', options, failure)
        yield chunk
      }
    } catch (error) {
      if (!options?.signal?.aborted) provider.noteAdapterFailure?.('thrown', options, error)
      throw error
    }
  })()
}

export function observeAdapter(adapter, provider) {
  return new Proxy(adapter, {
    get(target, property) {
      if (property === 'stream') return options => observed(o => target.stream(o), options, provider)
      if (property === 'prepareCall') return async (...args) => {
        const call = await target.prepareCall(...args)
        return { ...call, stream: options => observed(o => call.stream(o), options, provider) }
      }
      const value = Reflect.get(target, property, target)
      return typeof value === 'function' ? value.bind(target) : value
    },
  })
}
