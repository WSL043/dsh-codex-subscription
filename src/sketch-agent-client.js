import { CHANNEL, unwrap } from './rpc-contract.js'

export function connectSketchAgent(rpc, sessionId, execute, report, pollDelay = () => 350) {
  let stopped=false, token, timer
  const call=(endpoint,payload)=>rpc.call(CHANNEL,`sketch/${endpoint}`,{sessionId,token,...payload}).then(unwrap)
  const poll=async()=>{
    try {
      const tasks=await call('poll')
      for(const task of tasks){
        if(stopped)break
        let value,error
        try{if(task.expiresAt<Date.now())throw Error('Sketch command expired; inspect before retrying');value=await execute(task.request)}catch(cause){error=cause.message}
        await call('result',{id:task.id,value,error})
      }
    }catch(error){if(!stopped)report(error.message);return}
    if(!stopped)timer=setTimeout(poll,pollDelay())
  }
  void call('connect').then(value=>{token=value.token;if(stopped)void call('disconnect').catch(()=>{});else void poll()},error=>{if(!stopped)report(error.message)})
  return ()=>{stopped=true;clearTimeout(timer);if(token)void call('disconnect').catch(()=>{})}
}

// Opening is allowed only for inspect, never for a stale queued write.
export async function executeSketchFromAgent(request, { available, open, execute, live = () => true, wait = () => new Promise(resolve => setTimeout(resolve, 20)) }) {
  if (!available()) {
    if (request.action !== 'inspect') throw Error('Sketch board closed; inspect before editing')
    if (!live()) throw Error('Sketch session disconnected')
    open()
    for (let i = 0; i < 100 && live() && !available(); i++) await wait()
  }
  if (!live() || !available()) throw Error('Sketch board could not open in the current session')
  return execute(request)
}
