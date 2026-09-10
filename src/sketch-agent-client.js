import { CHANNEL, unwrap } from './rpc-contract.js'

export function connectSketchAgent(rpc, sessionId, execute, report) {
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
    if(!stopped)timer=setTimeout(poll,350)
  }
  void call('connect').then(value=>{token=value.token;if(stopped)void call('disconnect').catch(()=>{});else void poll()},error=>{if(!stopped)report(error.message)})
  return ()=>{stopped=true;clearTimeout(timer);if(token)void call('disconnect').catch(()=>{})}
}
