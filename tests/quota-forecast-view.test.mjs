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
  const start=Date.UTC(2026,11,31,14),end=Date.UTC(2026,11,31,17)
  for(const [locale,words] of [['zh-CN',zh],['en-US',en]]) {
    const label=formatQuotaRunout({kind:'time',earliest:end,latest:end},{t:key=>words[key],locale,now:start,timeZone:'Asia/Tokyo'})
    assert.equal(label,locale==='zh-CN'?'明天凌晨':'early tomorrow morning')
  }
})

const point = time => ({kind:'time',earliest:time,latest:time})
const display = (time, now, timeZone, language) => formatQuotaRunout(point(time), {t:key=>language==='zh'?zh[key]:en[key],locale:language==='zh'?'zh-CN':'en-US',now,timeZone})
for (const [zone,cn,english] of [
  ['UTC','周三下午','Wednesday afternoon'],
  ['Asia/Tokyo','周四凌晨','early Thursday morning'],
  ['Asia/Shanghai','周四凌晨','early Thursday morning'],
  ['America/Los_Angeles','周三早上','Wednesday morning'],
  ['America/New_York','周三下午','Wednesday afternoon'],
  ['Europe/London','周三下午','Wednesday afternoon'],
  ['Europe/Berlin','周三晚上','Wednesday evening'],
  ['Asia/Kolkata','周三晚上','Wednesday evening'],
  ['Asia/Kathmandu','周三晚上','Wednesday evening'],
  ['Pacific/Chatham','周四早上','Thursday morning'],
  ['Pacific/Honolulu','周三早上','Wednesday morning'],
  ['Australia/Lord_Howe','周四凌晨','early Thursday morning'],
]) test(`one instant uses the viewer's local weekday and day part in ${zone}, in both languages`, () => {
  const now=Date.UTC(2026,9,25,2),at=Date.UTC(2026,9,28,17)
  assert.equal(display(at,now,zone,'zh'),cn)
  assert.equal(display(at,now,zone,'en'),english)
})

test('today sounds natural in English, and intervals collapse to the same day part', () => {
  const now=Date.UTC(2026,9,25,0)
  assert.equal(display(Date.UTC(2026,9,25,7),now,'Asia/Tokyo','en'),'this afternoon')
  assert.equal(display(Date.UTC(2026,9,25,14),now,'Asia/Tokyo','en'),'tonight')
  const view={kind:'time',earliest:Date.UTC(2026,9,27,4),latest:Date.UTC(2026,9,27,12)}
  assert.equal(formatQuotaRunout(view,{t:key=>zh[key],locale:'zh-CN',timeZone:'Asia/Tokyo',now}),'周二下午至晚上')
  view.earliest=Date.UTC(2026,9,27,10)
  assert.equal(formatQuotaRunout(view,{t:key=>zh[key],locale:'zh-CN',timeZone:'Asia/Tokyo',now}),'周二晚上')
  const morning={kind:'time',earliest:Date.UTC(2026,9,26,18),latest:Date.UTC(2026,9,27,0)}
  assert.equal(formatQuotaRunout(morning,{t:key=>zh[key],locale:'zh-CN',timeZone:'Asia/Tokyo',now}),'周二凌晨至早上')
  assert.equal(formatQuotaRunout(morning,{t:key=>en[key],locale:'en-US',timeZone:'Asia/Tokyo',now}),'Tuesday morning')
})

for(const [zone,before,after] of [
  ['America/New_York',Date.UTC(2026,2,7,17),Date.UTC(2026,2,8,13)],
  ['America/New_York',Date.UTC(2026,9,31,16),Date.UTC(2026,10,1,14)],
  ['Europe/Berlin',Date.UTC(2026,2,28,12),Date.UTC(2026,2,29,7)],
  ['Europe/Berlin',Date.UTC(2026,9,24,11),Date.UTC(2026,9,25,8)],
]) test(`tomorrow is a calendar day across DST in ${zone} at ${new Date(after).toISOString()}`, () => {
  assert.equal(display(after,before,zone,'zh'),'明天早上')
  assert.equal(display(after,before,zone,'en'),'tomorrow morning')
})

test('displaying another time zone or crossing midnight never changes the estimated instant', () => {
  const at=Date.UTC(2026,11,31,14,30),forecast={status:'ready',runwaySeconds:7200}
  const view=quotaForecastView(forecast,{fetchedAt:at,now:at})
  const original=structuredClone(view)
  for(const zone of ['Asia/Tokyo','America/Los_Angeles','Asia/Kathmandu']) formatQuotaRunout(view,{t:key=>en[key],locale:'en-US',timeZone:zone,now:at})
  assert.deepEqual(view,original)
  const end=Date.UTC(2027,0,1,1)
  assert.equal(display(end,Date.UTC(2026,11,31,14),'Asia/Tokyo','zh'),'明天早上')
  assert.equal(display(end,Date.UTC(2026,11,31,16),'Asia/Tokyo','zh'),'今天早上')
})
