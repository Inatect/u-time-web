// Fetches a single transactionally published catalog: no pagination race / partial release.
export async function fetchCatalog(config,fetcher=fetch){
 let url=new URL('./catalog.json',import.meta.url),options={cache:'no-cache'};
 if(config.provider==='supabase'){
  const host=new URL(config.supabaseUrl);if(host.protocol!=='https:')throw Error('Supabase URL은 HTTPS여야 합니다.');
  const key=config.publishableKey;
  if(typeof key!=='string'||!(key.startsWith('sb_publishable_')||key.startsWith('eyJ')))throw Error('Supabase 공개용 키를 설정해주세요.');
  if(key.startsWith('eyJ')){try{const payload=JSON.parse(atob(key.split('.')[1].replace(/-/g,'+').replace(/_/g,'/')));if(payload.role!=='anon')throw Error();}catch{throw Error('브라우저에는 anon 또는 publishable 키만 사용할 수 있습니다.');}}
  url=new URL('/rest/v1/rpc/u_catalog',host);options={method:'POST',headers:{apikey:key,'Content-Type':'application/json',...(key.startsWith('eyJ')?{Authorization:`Bearer ${key}`}:{})},body:'{}',cache:'no-store'};
 }else if(config.provider!=='snapshot')throw Error('데이터 공급자 설정을 확인해주세요.');
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),12000);
 try{const response=await fetcher(url,{...options,signal:controller.signal});if(!response.ok)throw Error(`강좌 데이터 조회 실패 (${response.status}). Supabase 설정·공개 권한 또는 연결을 확인해주세요.`);const d=await response.json();if(!d||d.releaseSchema!==1||!Array.isArray(d.courses)||!Array.isArray(d.sources)||!d.metadata||!d.fingerprint||!d.courses.length)throw Error('공개된 강좌 데이터가 없거나 지원하지 않는 형식입니다.');const ids=new Set();for(const c of d.courses){if(!c.id||ids.has(c.id)||!Array.isArray(c.observations)||!Array.isArray(c.slots))throw Error('강좌 데이터의 식별자·구조가 올바르지 않습니다.');ids.add(c.id);}return d;}catch(e){if(e.name==='AbortError')throw Error('강좌 데이터 연결 시간이 초과되었습니다. 다시 접속해주세요.');throw e;}finally{clearTimeout(timer);}
}
