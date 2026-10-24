import test from 'node:test'
import assert from 'node:assert/strict'
import { quotaForecastView, formatQuotaRunout } from '../src/quota-forecast-view.js'
import { estimateQuotaForecast, observeQuotaForecast } from '../src/quota-forecast.js'
import { formatQuotaForecast } from '../src/client-shared.js'
import { zh, en } from '../src/client-locales.js'

const now=Date.UTC(2026,9,24,12), ready={status:'ready',runwaySeconds:7200,runwayMinSeconds:3600,runwayMaxSeconds:10800,survivesReset:false}
test('all presentations use the same snapshot-anchored run-out dates, including cached reads', () => {
  const a=quotaForecastView(ready,{fetchedAt:now,now}),b=quotaForecastView(ready,{fetchedAt:now,now:now+120000})
  assert.deepEqual(a,b)
  assert.equal(a.earliest,now+3600000);assert.equal(a.latest,now+10800000)
  for(const locale of [zh,en]) {
    const t=key=>locale[key]??key
    assert.equal(formatQuotaForecast(ready,t,{fetchedAt:now,now}),formatQuotaForecast(ready,t,{fetchedAt:now,now:now+120000}))
    assert.doesNotMatch(formatQuotaForecast(ready,t,{fetchedAt:now,now}),/undefined|NaN|quotaForecast/)
  }
})
test('old, future and reset readings stop predicting; expired run-out dates never remain in the future', () => {
  assert.equal(quotaForecastView(ready,{fetchedAt:now-300001,now}).kind,'stale')
  assert.equal(quotaForecastView(ready,{fetchedAt:now+1,now}).kind,'stale')
  assert.equal(quotaForecastView(ready,{fetchedAt:now,now,resetsAt:now/1000}).kind,'stale')
  assert.equal(quotaForecastView({...ready,runwaySeconds:60,runwayMinSeconds:undefined,runwayMaxSeconds:undefined},{fetchedAt:now-300000,now}).kind,'stale')
  assert.equal(quotaForecastView({...ready,runwaySeconds:30,runwayMinSeconds:undefined,runwayMaxSeconds:undefined},{fetchedAt:now-120000,now}).kind,'stale')
  assert.equal(quotaForecastView({...ready,survivesReset:true},{fetchedAt:now,now,refreshError:true}).kind,'stale')
  assert.notEqual(quotaForecastView({...ready,survivesReset:true},{now}).kind,'reset')
  assert.notEqual(quotaForecastView({...ready,survivesReset:true},{fetchedAt:now,now}).kind,'reset')
  assert.equal(quotaForecastView(ready,{fetchedAt:now,now,resetsAt:(now+1800000)/1000}).kind,'reset')
})
test('coarse provisional consumption cannot claim survival until reset in either the engine or presentation', () => {
  const current=now+38*60000,window={windowSeconds:604800,resetsAt:(current+10*3600000)/1000,remainingPercent:40}
  let state
  for(const [minute,remainingPercent] of [[0,42],[2,42],[5,41],[15,41],[25,41],[34,40],[38,40]])state=observeQuotaForecast(state,[{...window,remainingPercent}],now+minute*60000).state
  const forecast=estimateQuotaForecast(state,window,current)
  assert.equal(forecast.provisional,true);assert.equal(forecast.survivesReset,false)
  assert.equal(quotaForecastView({...forecast,survivesReset:true},{fetchedAt:current,now:current}).kind,'time')
  const label=formatQuotaForecast(forecast,key=>zh[key],{fetchedAt:current,now:current})
  assert.match(label,/粗估/);assert.doesNotMatch(label,/够用/)
})
test('calendar labels cross local day and year boundaries and support English and Chinese', () => {
  const start=new Date(2026,11,31,23,0).getTime(),end=new Date(2027,0,1,2,0).getTime()
  for(const [locale,words] of [['zh-CN',zh],['en-US',en]]) {
    const label=formatQuotaRunout({kind:'time',earliest:end,latest:end},{t:key=>words[key],locale,now:start})
    assert.match(label,locale==='zh-CN'?/明天/:/tomorrow|Tomorrow/)
    assert.match(label,/02:00/)
  }
})
