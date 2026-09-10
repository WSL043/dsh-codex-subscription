import { readFile } from 'node:fs/promises'
export function registerSketchCodec(connection) {
  let source
  return connection.fetch.register({
    path:'/api/codex-subscription/sketch-psd-worker',methods:['GET'],requestBody:'buffered',
    async fetch(){
      source??=await readFile(new URL('./sketch-psd-worker.js',import.meta.url))
      return new Response(source,{headers:{'content-type':'text/javascript; charset=utf-8','cache-control':'no-store'}})
    },
  })
}
