import assert from 'node:assert/strict'
import test from 'node:test'
import {
  FETCH_ORDER_FIELD, FETCH_CHAIN_PROVIDER_ID, FETCH_STOP,
  isCompositeFetchProvider, validateFetchOrder, changeFetchOrder, fetchOrderOptions,
} from '../src/fetch-order.js'

const providers = Object.freeze(['A', 'B', 'C', 'D', 'E'])
const fallbackId = 'codex-subscription-fetch-fallback'
const codexId = 'codex-subscription-fetch'

test('the fixed exports distinguish composite providers from the Codex atomic provider', () => {
  assert.equal(FETCH_ORDER_FIELD, 'fetchProviderOrder')
  assert.equal(FETCH_CHAIN_PROVIDER_ID, 'codex-subscription-fetch-chain')
  assert.equal(FETCH_STOP, '__stop__')
  assert.equal(isCompositeFetchProvider(fallbackId), true)
  assert.equal(isCompositeFetchProvider(FETCH_CHAIN_PROVIDER_ID), true)
  for (const id of [codexId, 'A', FETCH_STOP, '', null, undefined, 1]) {
    assert.equal(isCompositeFetchProvider(id), false)
  }
})

test('ABC plus stop offers all sources for existing rows and only unused sources at the end', () => {
  const order = ['A', 'B', 'C']
  assert.deepEqual(fetchOrderOptions(order, 0, providers), providers)
  assert.deepEqual(fetchOrderOptions(order, 1, providers), [...providers, FETCH_STOP])
  assert.deepEqual(fetchOrderOptions(order, 2, providers), [...providers, FETCH_STOP])
  assert.deepEqual(fetchOrderOptions(order, 3, providers), ['D', 'E', FETCH_STOP])
})

test('choosing an unused source replaces an existing ABC row without changing the other rows', () => {
  const order = ['A', 'B', 'C']
  assert.deepEqual(changeFetchOrder(order, 0, 'D', providers), ['D', 'B', 'C'])
  assert.deepEqual(changeFetchOrder(order, 1, 'E', providers), ['A', 'E', 'C'])
  assert.deepEqual(changeFetchOrder(order, 2, 'D', providers), ['A', 'B', 'D'])
  assert.deepEqual(order, ['A', 'B', 'C'])
})

test('choosing a used source exchanges the two existing positions in either direction', () => {
  const order = ['A', 'B', 'C']
  assert.deepEqual(changeFetchOrder(order, 0, 'C', providers), ['C', 'B', 'A'])
  assert.deepEqual(changeFetchOrder(order, 1, 'A', providers), ['B', 'A', 'C'])
  assert.deepEqual(changeFetchOrder(order, 2, 'B', providers), ['A', 'C', 'B'])
  const unchanged = changeFetchOrder(order, 1, 'B', providers)
  assert.deepEqual(unchanged, order)
  assert.notEqual(unchanged, order)
})

test('stop truncates from a non-first existing row and leaves the trailing stop unchanged', () => {
  const order = ['A', 'B', 'C']
  assert.deepEqual(changeFetchOrder(order, 1, FETCH_STOP, providers), ['A'])
  assert.deepEqual(changeFetchOrder(order, 2, FETCH_STOP, providers), ['A', 'B'])
  const unchanged = changeFetchOrder(order, 3, FETCH_STOP, providers)
  assert.deepEqual(unchanged, order)
  assert.notEqual(unchanged, order)
})

test('appending adds one row and moves the stop entry until every source is used', () => {
  const four = changeFetchOrder(['A', 'B', 'C'], 3, 'E', providers)
  assert.deepEqual(four, ['A', 'B', 'C', 'E'])
  assert.deepEqual(fetchOrderOptions(four, 4, providers), ['D', FETCH_STOP])
  const full = changeFetchOrder(four, 4, 'D', providers)
  assert.deepEqual(full, ['A', 'B', 'C', 'E', 'D'])
  assert.deepEqual(fetchOrderOptions(full, 5, providers), [])
  assert.deepEqual(fetchOrderOptions(full, 4, providers), [...providers, FETCH_STOP])
  assert.deepEqual(changeFetchOrder(full, 5, FETCH_STOP, providers), full)
})

test('the trailing row cannot exchange with any existing source', () => {
  for (const id of ['A', 'B', 'C']) {
    assert.throws(() => changeFetchOrder(['A', 'B', 'C'], 3, id, providers), Error)
  }
})

test('the first row cannot stop, including the unconfigured UI state', () => {
  for (const order of [[], ['A'], ['A', 'B', 'C']]) {
    assert.throws(() => changeFetchOrder(order, 0, FETCH_STOP, providers), Error)
    assert.equal(fetchOrderOptions(order, 0, providers).includes(FETCH_STOP), false)
  }
})

test('expanding after truncation never restores the deleted tail', () => {
  const initial = ['A', 'B', 'C']
  const truncated = changeFetchOrder(initial, 1, FETCH_STOP, providers)
  assert.deepEqual(fetchOrderOptions(truncated, 1, providers), ['B', 'C', 'D', 'E', FETCH_STOP])
  const expanded = changeFetchOrder(truncated, 1, 'E', providers)
  assert.deepEqual(expanded, ['A', 'E'])
  assert.deepEqual(changeFetchOrder(expanded, 2, 'B', providers), ['A', 'E', 'B'])
  assert.deepEqual(initial, ['A', 'B', 'C'])
})

test('a single-source directory has no stop row once its only source is selected', () => {
  assert.deepEqual(fetchOrderOptions([], 0, ['A']), ['A'])
  assert.deepEqual(changeFetchOrder([], 0, 'A', ['A']), ['A'])
  assert.deepEqual(fetchOrderOptions(['A'], 1, ['A']), [])
  assert.deepEqual(fetchOrderOptions(['A'], 0, ['A']), ['A'])
  assert.throws(() => changeFetchOrder(['A'], 1, 'A', ['A']), Error)
})

test('the empty UI state is allowed without sources but is not valid persisted configuration', () => {
  assert.deepEqual(fetchOrderOptions([], 0, []), [])
  assert.throws(() => validateFetchOrder([]), Error)
  assert.throws(() => changeFetchOrder([], 0, 'A', []), Error)
  assert.throws(() => changeFetchOrder([], 0, FETCH_STOP, []), Error)
  assert.deepEqual(changeFetchOrder([], 0, 'A', providers), ['A'])
})

test('validation clones valid arrays and accepts boundary lengths and non-ASCII atomic ids', () => {
  for (const order of [['A'], [codexId, '读取来源'], ['A'.repeat(256)], Array.from({ length: 100 }, (_, index) => `source-${index}`)]) {
    const snapshot = [...order]
    Object.freeze(order)
    const result = validateFetchOrder(order)
    assert.deepEqual(result, snapshot)
    assert.notEqual(result, order)
    result.push('new-source')
    assert.deepEqual(order, snapshot)
  }
})

const invalidOrders = [
  undefined, null, false, 1, 'A', {}, new Set(['A']), [],
  [''], [' '], [' A'], ['A '], ['\u00a0A'], ['A\u3000'],
  [null], [undefined], [1], [true], [{}], [['A']], new Array(1),
  ['A', 'A'], ['A'.repeat(257)], [FETCH_STOP], [fallbackId], [FETCH_CHAIN_PROVIDER_ID],
  Array.from({ length: 101 }, (_, index) => `source-${index}`),
]

test('validation rejects malformed arrays, duplicates, reserved ids and excessive lengths without mutation', () => {
  for (const order of invalidOrders) {
    const snapshot = Array.isArray(order) ? order.slice() : order
    assert.throws(() => validateFetchOrder(order), Error)
    assert.deepEqual(order, snapshot)
  }
})

test('validation rejects every C0, DEL and C1 control character anywhere inside an id', () => {
  const controls = [...Array.from({ length: 32 }, (_, index) => index), ...Array.from({ length: 33 }, (_, index) => index + 127)]
  for (const control of controls) {
    assert.throws(() => validateFetchOrder([`source${String.fromCodePoint(control)}id`]), Error)
  }
})

test('changing and listing reject malformed state rather than repairing it', () => {
  for (const order of invalidOrders) {
    if (Array.isArray(order) && order.length === 0) continue
    assert.throws(() => changeFetchOrder(order, 0, 'A', providers), Error)
    assert.throws(() => fetchOrderOptions(order, 0, providers), Error)
  }
})

test('changing and listing reject invalid row indices without coercion', () => {
  for (const index of [-1, 4, 0.5, NaN, Infinity, -Infinity, '0', null, undefined, true, {}, 1n]) {
    assert.throws(() => changeFetchOrder(['A', 'B', 'C'], index, 'D', providers), Error)
    assert.throws(() => fetchOrderOptions(['A', 'B', 'C'], index, providers), Error)
  }
  assert.throws(() => changeFetchOrder([], 1, 'A', providers), Error)
  assert.throws(() => fetchOrderOptions([], 1, providers), Error)
})

test('unknown, invalid and composite selections are rejected even if listed in the directory', () => {
  const invalidIds = [undefined, null, false, 1, {}, [], '', ' A', 'A ', 'A\u0000B', 'A'.repeat(257), fallbackId, FETCH_CHAIN_PROVIDER_ID]
  for (const next of ['missing', ...invalidIds]) {
    const directory = [...providers, ...invalidIds]
    assert.throws(() => changeFetchOrder(['A'], 0, next, directory), Error)
    assert.throws(() => changeFetchOrder(['A'], 1, next, directory), Error)
    assert.throws(() => changeFetchOrder([], 0, next, directory), Error)
  }
})

test('the directory is deduplicated and composite strategies and invalid ids are not offered', () => {
  const directory = Object.freeze(['A', fallbackId, 'A', FETCH_CHAIN_PROVIDER_ID, codexId, FETCH_STOP, '', null, 2, ' B', 'B', 'B'])
  assert.deepEqual(fetchOrderOptions([], 0, directory), ['A', codexId, 'B'])
  assert.deepEqual(fetchOrderOptions(['A'], 0, directory), ['A', codexId, 'B'])
  assert.deepEqual(fetchOrderOptions(['A'], 1, directory), [codexId, 'B', FETCH_STOP])
  assert.deepEqual(changeFetchOrder(['A'], 1, codexId, directory), ['A', codexId])
  assert.deepEqual(validateFetchOrder([codexId]), [codexId])
})

test('missing providers stay in the order but cannot be selected, even in their current row', () => {
  const order = Object.freeze(['A', 'missing', 'C'])
  assert.deepEqual(validateFetchOrder(order), order)
  assert.deepEqual(fetchOrderOptions(order, 1, providers), [...providers, FETCH_STOP])
  assert.deepEqual(fetchOrderOptions(order, 3, providers), ['B', 'D', 'E', FETCH_STOP])
  assert.deepEqual(changeFetchOrder(order, 0, 'C', providers), ['C', 'missing', 'A'])
  assert.deepEqual(changeFetchOrder(order, 1, 'C', providers), ['A', 'C', 'missing'])
  assert.deepEqual(changeFetchOrder(order, 1, 'B', providers), ['A', 'B', 'C'])
  assert.deepEqual(changeFetchOrder(order, 3, 'B', providers), ['A', 'missing', 'C', 'B'])
  for (const index of [0, 1, 3]) assert.throws(() => changeFetchOrder(order, index, 'missing', providers), Error)
})

test('a changing or empty directory never removes missing ids or reuses stale candidates', () => {
  const order = ['A', 'B']
  assert.deepEqual(fetchOrderOptions(order, 2, ['A', 'B']), [])
  assert.deepEqual(fetchOrderOptions(order, 2, ['A', 'B', 'C']), ['C', FETCH_STOP])
  assert.deepEqual(fetchOrderOptions(order, 0, []), [])
  assert.deepEqual(fetchOrderOptions(order, 1, []), [FETCH_STOP])
  assert.deepEqual(fetchOrderOptions(order, 2, []), [])
  assert.deepEqual(changeFetchOrder(order, 2, FETCH_STOP, []), order)
  assert.deepEqual(changeFetchOrder(order, 1, FETCH_STOP, []), ['A'])
  assert.throws(() => changeFetchOrder(order, 0, 'A', []), Error)
  assert.deepEqual(fetchOrderOptions(order, 2, ['C', 'A']), ['C', FETCH_STOP])
  assert.deepEqual(order, ['A', 'B'])
})

test('non-array provider directories are rejected consistently', () => {
  for (const directory of [undefined, null, 'ABC', {}, new Set(['A'])]) {
    assert.throws(() => fetchOrderOptions(['A'], 0, directory), Error)
    assert.throws(() => changeFetchOrder(['A'], 0, 'A', directory), Error)
    assert.throws(() => changeFetchOrder(['A'], 1, FETCH_STOP, directory), Error)
  }
})

test('the 100-source state limit prevents appending but still permits replacement and truncation', () => {
  const directory = Array.from({ length: 101 }, (_, index) => `source-${index}`)
  const order = directory.slice(0, 100)
  assert.deepEqual(fetchOrderOptions(order, 100, directory), [])
  assert.throws(() => changeFetchOrder(order, 100, directory[100], directory), Error)
  assert.deepEqual(changeFetchOrder(order, 100, FETCH_STOP, directory), order)
  const replaced = changeFetchOrder(order, 0, directory[100], directory)
  assert.equal(replaced.length, 100)
  assert.equal(replaced[0], directory[100])
  const truncated = changeFetchOrder(order, 99, FETCH_STOP, directory)
  assert.equal(truncated.length, 99)
  assert.deepEqual(fetchOrderOptions(truncated, 99, directory), [directory[99], directory[100], FETCH_STOP])
})

function partialPermutations(ids) {
  return [[], ...ids.flatMap(id => partialPermutations(ids.filter(candidate => candidate !== id)).map(tail => [id, ...tail]))]
}

test('small-set enumeration preserves purity, uniqueness and the replace/swap/truncate contract', () => {
  const ids = ['A', 'B', 'C']
  const directories = ids.reduce((subsets, id) => [...subsets, ...subsets.map(subset => [...subset, id])], [[]])
  for (const state of partialPermutations([...ids, 'missing'])) {
    const order = Object.freeze(state)
    for (const subset of directories) {
      const directory = Object.freeze([...subset, fallbackId, FETCH_CHAIN_PROVIDER_ID, ...subset])
      for (let index = 0; index <= order.length; index++) {
        const candidates = fetchOrderOptions(order, index, directory)
        const available = index < order.length ? subset : subset.filter(id => !order.includes(id))
        const expected = index === 0 ? available : index < order.length || available.length ? [...available, FETCH_STOP] : []
        assert.deepEqual(candidates, expected)
        assert.equal(new Set(candidates).size, candidates.length)
        for (const next of candidates) {
          const before = [...order]
          const result = changeFetchOrder(order, index, next, directory)
          assert.notEqual(result, order)
          assert.deepEqual(order, before)
          assert.deepEqual(validateFetchOrder(result), result)
          if (next === FETCH_STOP) {
            assert.deepEqual(result, before.slice(0, index))
          } else if (index === order.length) {
            assert.deepEqual(result, [...before, next])
          } else {
            const previousIndex = before.indexOf(next)
            assert.equal(result[index], next)
            assert.equal(result.length, before.length)
            if (previousIndex !== -1) assert.equal(result[previousIndex], before[index])
            for (let position = 0; position < before.length; position++) {
              if (position !== index && position !== previousIndex) assert.equal(result[position], before[position])
            }
          }
        }
        for (const next of [...ids, 'missing', FETCH_STOP]) {
          const trailingStop = index > 0 && index === order.length && next === FETCH_STOP
          if (!candidates.includes(next) && !trailingStop) {
            assert.throws(() => changeFetchOrder(order, index, next, directory), Error)
          }
        }
      }
    }
  }
})
