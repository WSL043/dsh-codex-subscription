import { zh, en } from './client-locales.js'
import ja from './locales/ja.js'
import es from './locales/es.js'
import fr from './locales/fr.js'
import de from './locales/de.js'
import ru from './locales/ru.js'
import pt from './locales/pt.js'

// DSH owns the language catalog, persistence, reactive switching and fallbacks.
// Register dictionaries only; never add another language selector or preference.
export const dictionaries = { zh, en, ja, es, fr, de, ru, pt }
