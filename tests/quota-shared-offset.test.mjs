import test from 'node:test'
import assert from 'node:assert/strict'
import { quotaRateInterval, quotaSharedOffsetInterval, refineQuotaRate } from '../src/quota-rate-interval.js'
const sample=(minute,used)=>({at:minute*60000,remainingPercent:100-used})

test('shared quantizer cancels floor/ceil/nearest offset while keeping plateau evidence',()=>{
 for(const quantize of [Math.floor,Math.ceil,Math.round]) {
  const points=Array.from({length:81},(_,i)=>sample(i,quantize(20.3+i*.2)))
  const tight=quotaSharedOffsetInterval(points,{maxLagMs:0}),broad=quotaRateInterval(points)
  assert.ok(tight.min<=.2+1e-10 && tight.max>=.2-1e-10)
  assert.ok(tight.max-tight.min<broad.max-broad.min)
  const changes=points.filter((p,i)=>!i||p.remainingPercent!==points[i-1].remainingPercent)
  const jumps=quotaSharedOffsetInterval(changes,{maxLagMs:0})
  assert.ok(tight.max-tight.min<jumps.max-jumps.min)
 }
})

test('variable report lag inside the explicit budget keeps true pace inside the interval',()=>{
 for(const quantize of [Math.floor,Math.ceil,Math.round]) for(const rate of [.025,.05,.2,.4]) {
  const points=Array.from({length:91},(_,i)=>sample(i,quantize(20+rate*(i-(i%7)/3))))
  const estimate=quotaSharedOffsetInterval(points)
  assert.ok(estimate.feasible)
  assert.ok(estimate.min<=rate+1e-10 && estimate.max>=rate-1e-10)
 }
})

test('refinement requires repeat crossings, integer data and sufficient span',()=>{
 for(const points of [[sample(0,20),sample(10,21),sample(30,22)],Array.from({length:30},(_,i)=>sample(i,20)),Array.from({length:30},(_,i)=>sample(i,20+i*.2))]) {
  const base=quotaRateInterval(points)
  assert.equal(refineQuotaRate(points,base),base)
 }
 const points=Array.from({length:81},(_,i)=>sample(i,Math.floor(20+i*.05)))
 assert.equal(refineQuotaRate(points,quotaRateInterval(points)).method,'shared-offset')
})

test('burst and long delayed delivery cannot be forced into a narrow steady-pace interval',()=>{
 const points=[sample(0,20),sample(19,20),sample(20,21),sample(39,21),sample(40,22),sample(59,22),sample(60,23),sample(61,29)]
 assert.equal(quotaSharedOffsetInterval(points).feasible,false)
 const base=quotaRateInterval(points)
 assert.equal(refineQuotaRate(points,base),base)
 const plateau=[...Array.from({length:61},(_,i)=>sample(i,Math.floor(20+i*.1))),...Array.from({length:60},(_,i)=>sample(61+i,26))]
 assert.equal(quotaSharedOffsetInterval(plateau).feasible,false)
})
