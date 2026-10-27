import {config} from './config.js';
import {fetchCatalog} from './source.mjs';
let data,loading,worker,sequence=0;
const waiting=new Map();
function boot(){worker=new Worker(new URL('./worker.mjs',import.meta.url),{type:'module'});worker.onmessage=({data:m})=>{const job=waiting.get(m.id);if(!job)return;clearTimeout(job.timer);waiting.delete(m.id);m.error?job.reject(Object.assign(Error(m.error.message),{kind:m.error.kind})):job.resolve(m.result);};worker.onerror=()=>reset('브라우저 계산기를 시작하지 못했습니다. 다시 시도해주세요.');}
function reset(message,kind='timeout'){worker?.terminate();worker=null;for(const job of waiting.values()){clearTimeout(job.timer);job.reject(Object.assign(Error(message),{kind}));}waiting.clear();}
function call(path,body){if(!worker)boot();const id=++sequence;return new Promise((resolve,reject)=>{const timer=setTimeout(()=>reset('계산 대기시간을 초과했습니다. 결과를 적용하지 않았습니다.'),15000);waiting.set(id,{resolve,reject,timer});worker.postMessage({id,path,body});});}
async function load(){if(data)return data;if(!loading)loading=(async()=>{const next=await fetchCatalog(config);await call('init',next.courses);data=next;return data;})().finally(()=>loading=null);return loading;}
export async function api(path,body){
 if(path==='/api/import')throw Error('공개 웹앱에서는 강의 DB를 변경할 수 없습니다. 관리자가 정제한 자료를 배포해주세요.');
 const d=await load();if(!worker)await call('init',d.courses);
 if(path==='/api/data')return d;
 if(path==='/api/metadata')return d.metadata;
 if(path==='/api/time-reference')return d.timeReference;
 if(path==='/api/imports')return [];
 if(path==='/api/quality')return d.stats;
 if(path==='/api/course')return d.courses.find(c=>c.id===body?.id);
 return call(path,body);
}
export function cancelCalculation(){reset('사용자가 계산을 취소했습니다. 기존 시간표는 유지됩니다.','cancelled');}
