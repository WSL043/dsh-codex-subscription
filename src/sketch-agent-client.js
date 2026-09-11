import { CHANNEL, unwrap } from './rpc-contract.js'

export function connectSketchAgent(rpc, sessionId, execute, report, pollDelay = () => 350) {
  let stopped=false, token, timer, attempts=0, failures=0
  const call=(endpoint,payload)=>rpc.call(CHANNEL,`sketch/${endpoint}`,{sessionId,token,...payload}).then(unwrap)
  const poll=async()=>{
    try {
      const tasks=await call('poll')
      for(const task of tasks){
        if(stopped)break
        if(task.cancelled){report('Sketch operation interrupted; completed strokes are preserved.');continue}
        let value,error
        try{
          if(task.expiresAt<Date.now() || !await call('claim',{id:task.id}))throw Error('Sketch command expired or cancelled; inspect before retrying')
          if(stopped)break
          value=await execute(task.request)
        }catch(cause){error=cause.message}
        await call('result',{id:task.id,value,error})
      }
    }catch(error){
      if(!stopped){
        if(++failures>5){report(`${error.message}; reconnect failed. Reopen this session to retry.`);return}
        report(`${error.message}; reconnecting. Inspect recentRequests before retrying a write.`)
        if(token)void call('disconnect').catch(()=>{})
        token=undefined;timer=setTimeout(connect,Math.min(10000,1000*2**(failures-1)))
      }
      return
    }
    failures=0
    if(!stopped)timer=setTimeout(poll,pollDelay())
  }
  const connect=()=>void call('connect').then(value=>{token=value.token;attempts=0;if(stopped)void call('disconnect').catch(()=>{});else void poll()},error=>{
    if(stopped)return
    // A refreshed page must outwait the old 10s lease; never replace a live peer.
    const leaseConflict=/Another board is connected/.test(error.message)
    if(++attempts<(leaseConflict?8:3))timer=setTimeout(connect,Math.min(3000,500*attempts))
    else report(error.message)
  })
  connect()
  return ()=>{stopped=true;clearTimeout(timer);if(token)void call('disconnect').catch(()=>{})}
}
