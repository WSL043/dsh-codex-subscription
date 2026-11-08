const echoKey = text => text.normalize('NFKC').trim().replace(/[\s\p{P}]+/gu, '').toLowerCase()

export const needsScreenAnswer = request => request.questions.some(question => question.options?.length || question.intent)

/** Free-text questions pass through the user's words. Choice and confirmation forms use the host UI. */
export function createVoiceQuestions({ speak, now = Date.now, deliveryMs = 15_000 }) {
  let pending
  let recent = []
  const finish = (value, error) => {
    const current = pending
    if (!current) return
    pending = undefined
    clearTimeout(current.delivery)
    current.signal?.removeEventListener('abort', current.abort)
    if (error) current.reject(error)
    else current.resolve(value)
  }
  const prompt = () => {
    const current = pending
    const question = current.questions[current.answers.length]
    clearTimeout(current.delivery)
    current.readBack = ''
    try {
      if (!speak(question)) throw new Error('Could not send the question to the voice service')
      current.delivery = setTimeout(() => finish(undefined, new Error('No voice response to the question')), deliveryMs)
      current.delivery.unref?.()
    } catch (error) { finish(undefined, error) }
  }
  const questions = {
    ask(request) {
      if (pending) return Promise.reject(new Error('Another voice question is still open'))
      if (request.signal?.aborted) return Promise.reject(request.signal.reason ?? new Error('Question aborted'))
      if (!request.questions?.length || needsScreenAnswer(request)) return Promise.reject(new Error('The question needs the DSH answer form'))
      return new Promise((resolve, reject) => {
        pending = { questions: request.questions, answers: [], signal: request.signal, resolve, reject }
        pending.abort = () => finish(undefined, request.signal.reason ?? new Error('Question aborted'))
        request.signal?.addEventListener('abort', pending.abort, { once: true })
        prompt()
      })
    },
    consume(text, { delegation = false } = {}) {
      const key = echoKey(text)
      recent = recent.filter(item => now() - item.at < 10_000)
      if (delegation && recent.some(item => item.key === key)) return true
      if (!pending) return false
      // A generated delegation is not a verbatim answer from the user.
      if (delegation || !text.trim()) return true
      const { id } = pending.questions[pending.answers.length]
      recent.push({ key, at: now() })
      pending.answers.push({ id, selected: [], custom: text.trim() })
      if (pending.answers.length === pending.questions.length) finish({ answers: pending.answers })
      else prompt()
      return true
    },
    captureAnswer(text) {
      const question = pending
      const index = pending?.answers.length
      return () => { if (pending && pending === question && pending.answers.length === index) questions.consume(text) }
    },
    heardReply(text) {
      if (!pending?.delivery || !text) return
      const { question } = pending.questions[pending.answers.length]
      pending.readBack = (pending.readBack + echoKey(text)).slice(-2048)
      if (echoKey(question) && pending.readBack.includes(echoKey(question))) {
        clearTimeout(pending.delivery)
        pending.delivery = undefined
      }
    },
    close() { finish(undefined, new Error('Voice question connection closed')) },
    get active() { return pending !== undefined },
  }
  return questions
}
