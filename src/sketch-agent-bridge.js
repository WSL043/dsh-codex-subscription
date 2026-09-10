import { randomUUID } from 'node:crypto'

// Ephemeral session-scoped delivery only. The browser retains the document.
export function createSketchAgentBridge({ enabled, now = Date.now, timeoutMs = 20_000 }) {
  const sessions = new Map()
  const fail = (entry, message) => { for(const task of entry.tasks.values())task.reject(Error(message));entry.tasks.clear() }
  const find = payload => {
    const entry = sessions.get(payload.sessionId)
    if (!entry || entry.token !== payload.token || now()-entry.seen > 10_000) throw Error('Sketch connection expired')
    entry.seen = now();return entry
  }
  return {
    async rpc(endpoint, payload) {
      try {
        if (!enabled()) throw Error('Sketch is disabled')
        if (!payload || typeof payload.sessionId !== 'string' || !payload.sessionId.length || payload.sessionId.length > 200) throw Error('Invalid session')
        if (endpoint === 'sketch/connect') {
          for(const [id,entry] of sessions)if(now()-entry.seen>=10_000){fail(entry,'Sketch connection expired');sessions.delete(id)}
          const previous = sessions.get(payload.sessionId)
          if(previous && now()-previous.seen < 10_000)throw Error('Another board is connected to this session')
          if(previous)fail(previous,'Sketch connection replaced')
          const entry={token:randomUUID(),seen:now(),tasks:new Map()};sessions.set(payload.sessionId,entry)
          return {ok:true,value:{token:entry.token}}
        }
        const entry=find(payload)
        if(endpoint==='sketch/poll')return {ok:true,value:[...entry.tasks].filter(([,t])=>!t.delivered).map(([id,t])=>{t.delivered=true;return {id,request:t.request,expiresAt:t.expiresAt}})}
        if(endpoint==='sketch/disconnect'){fail(entry,'Sketch board closed');sessions.delete(payload.sessionId);return {ok:true,value:null}}
        if(endpoint==='sketch/result'){
          const task=entry.tasks.get(payload.id)
          if(task){entry.tasks.delete(payload.id);payload.error?task.reject(Error(String(payload.error).slice(0,500))):task.resolve(payload.value)}
          return {ok:true,value:null}
        }
        throw Error('Unknown sketch route')
      }catch(error){return {ok:false,error:{code:'invalid-input',message:error.message,details:{issues:[]}}}}
    },
    request(sessionId, request, signal) {
      if(!enabled())return Promise.reject(Error('Sketch is disabled'))
      const entry=sessions.get(sessionId)
      if(!entry || now()-entry.seen>10_000)return Promise.reject(Error('Switch to this session in DSH with sketch editing enabled'))
      if(entry.tasks.size)return Promise.reject(Error('Another sketch operation is pending'))
      if(JSON.stringify(request).length>2_000_000)return Promise.reject(Error('Sketch batch is too large'))
      return new Promise((resolve,reject)=>{
        const id=randomUUID()
        const finish=(callback,value)=>{clearTimeout(timer);signal?.removeEventListener('abort',abort);entry.tasks.delete(id);callback(value)}
        const abort=()=>finish(reject,Error('Sketch operation interrupted; inspect before retrying'))
        const timer=setTimeout(()=>finish(reject,Error('Sketch response timed out; inspect before retrying')),timeoutMs)
        entry.tasks.set(id,{request,expiresAt:now()+timeoutMs,delivered:false,resolve:value=>finish(resolve,value),reject:error=>finish(reject,error)})
        signal?.addEventListener('abort',abort,{once:true});if(signal?.aborted)abort()
      })
    },
    dispose(){for(const entry of sessions.values())fail(entry,'Sketch service stopped');sessions.clear()},
  }
}
