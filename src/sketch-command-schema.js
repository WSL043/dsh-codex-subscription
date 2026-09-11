const number={type:'number'},string={type:'string'}
const object=properties=>({type:'object',additionalProperties:false,properties})
const points={type:'array',items:object({x:{...number,required:true},y:{...number,required:true}})}
const style={color:string,width:number,opacity:number,fill:{type:'boolean'},text:string,points}
// DSH compiles this schema for both native function calls and run_code SDKs.
export const sketchCommandArray={type:'array',items:object({
  op:{type:'string',required:true,enum:['stroke','object','layer','resize']},
  id:{oneOf:[{type:'string'},{type:'integer'}],description:'Object string ID; layer commands use integer IDs.'},
  layer:{type:'integer'},shape:{type:'string',enum:['pen','line','arrow','text','rectangle','circle','ellipse','polygon','bezier','eraser']},
  ...style,
  action:{type:'string',enum:['update','duplicate','delete','add','select','rename','visible','up','down','clear']},
  value:string,ratio:{type:'string',enum:['1:1','4:3','3:4','16:9','9:16']},
  patch:object(style),transform:object({dx:number,dy:number,scaleX:number,scaleY:number}),
})}
