const normal = value => String(value).normalize('NFKC').toLocaleLowerCase().replaceAll('個', '个').replaceAll('項', '项').replaceAll('號', '号').replace(/[\s\p{P}\p{S}]/gu, '')
const ordinals = [
  ['1', '一', '壹', 'first', 'one', 'いち', 'ひとつめ', '첫번째', '하나', 'primero', 'premier', 'erste', 'primeiro', 'первый'],
  ['2', '二', '两', 'second', 'two', 'に', 'ふたつめ', '두번째', '둘', 'segundo', 'deuxième', 'zweite', 'второй'],
  ['3', '三', 'third', 'three', 'さん', 'みっつめ', '세번째', '셋', 'tercero', 'troisième', 'dritte', 'terceiro', 'третий'],
  ['4', '四', 'fourth', 'four', 'よん', '네번째', 'cuarto', 'quatrième', 'vierte', 'quarto', 'четвертый'],
  ['5', '五', 'fifth', 'five', 'ご', '다섯번째', 'quinto', 'cinquième', 'fünfte', 'пятый'],
  ['6', '六', 'sixth', 'six', 'ろく', '여섯번째', 'sexto', 'sixième', 'sechste', 'шестой'],
  ['7', '七', 'seventh', 'seven', 'なな', '일곱번째', 'séptimo', 'septième', 'siebte', 'sétimo', 'седьмой'],
  ['8', '八', 'eighth', 'eight', 'はち', '여덟번째', 'octavo', 'huitième', 'achte', 'oitavo', 'восьмой'],
  ['9', '九', 'ninth', 'nine', 'きゅう', '아홉번째', 'noveno', 'neuvième', 'neunte', 'nono', 'девятый'],
]

/** Match an explicit label or ordinal; ambiguous speech leaves the question open. */
export function spokenChoice(text, question) {
  const said = normal(text)
  const options = question.options ?? []
  const exact = options.filter(option => normal(option.label) === said)
  if (exact.length === 1) return { id: question.id, selected: [exact[0].label] }
  const ordinal = said.replace(/^(?:我选|我要选|选择|选|第|option|choose|ichoose|number|the|el|le|die|opção|вариант)/u, '').replace(/^(?:第|option|number|the)/u, '').replace(/(?:个|项|号|番目|番|の選択肢|option|please|です|にして|でお願いします)$/u, '')
  const index = ordinals.findIndex(words => words.some(word => normal(word) === ordinal))
  if (index >= 0 && options.length) return index < options.length ? { id: question.id, selected: [options[index].label] } : undefined
  if (options.length === 0 && String(text).trim()) return { id: question.id, selected: [], custom: String(text).trim() }
  const custom = /^(?:其他[：:,，\s]*|其它[：:,，\s]*|other[：:,，\s]+)(.+)$/iu.exec(String(text).trim())
  if (custom) return { id: question.id, selected: [], custom: custom[1].trim() }
}

export function createVoiceQuestions({ speak, now = Date.now }) {
  let pending
  let recent = []
  const finish = (value, error) => {
    const current = pending
    if (!current) return
    pending = undefined
    current.signal?.removeEventListener('abort', current.abort)
    if (error) current.reject(error)
    else current.resolve(value)
  }
  const prompt = () => {
    const question = pending.questions[pending.answers.length]
    speak(`[COMPLETE] Ask the user this question in the conversation's language and read every option with its number, then wait. A spoken option number or label is handled by the application; do not delegate it as a new task. Question: ${JSON.stringify({ question: question.question, detail: question.detail, options: question.options?.map((option, index) => ({ number: index + 1, label: option.label, description: option.description })) })}`)
  }
  return {
    ask(request) {
      if (pending) return Promise.reject(new Error('Another voice question is still open'))
      if (request.signal?.aborted) return Promise.reject(request.signal.reason ?? new Error('Question aborted'))
      return new Promise((resolve, reject) => {
        pending = { questions: request.questions, answers: [], signal: request.signal, resolve, reject }
        pending.abort = () => finish(undefined, request.signal.reason ?? new Error('Question aborted'))
        request.signal?.addEventListener('abort', pending.abort, { once: true })
        prompt()
      })
    },
    consume(text, { delegation = false } = {}) {
      recent = recent.filter(item => now() - item.at < 10_000)
      const echo = recent.find(item => item.text === normal(text) && (delegation || item.delegation))
      if (echo) { if (!delegation) recent = recent.filter(item => item !== echo); return true }
      if (!pending) return false
      const answer = spokenChoice(text, pending.questions[pending.answers.length])
      if (!answer) { prompt(); return true }
      recent.push({ text: normal(text), at: now(), delegation })
      pending.answers.push(answer)
      if (pending.answers.length === pending.questions.length) finish({ answers: pending.answers })
      else prompt()
      return true
    },
    close() { finish(undefined, new Error('Voice question connection closed')) },
    get active() { return pending !== undefined },
  }
}
