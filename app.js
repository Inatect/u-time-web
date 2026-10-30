import {createPlanner} from './planner-ui.js?v=8d063b0d1d88b29c';
const $ = id => document.getElementById(id);
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let data, filtered = [], selected = new Map(), results = [], current = 0, page = 0, request = 0, revision = 0;
let planner;
const codeKey = c => `${c.year}-${c.semester}:${c.code}`;
const timeLabel = c => c.app_delivery_mode==='internet' ? '인터넷 강의 · 사용자 지정 분류 / 실제 일정 확인 필요' : planner?.timeLabel(c) || ({unspecified:'시간 미지정',unverified_subperiod:'A/B 교시 확인 필요',unsupported:'시간 해석 확인 필요'}[c.timeStatus] || c.timeRaw);
function message(text='') { $('message').textContent = text; }
import {api} from './transport.mjs?v=8d063b0d1d88b29c';

function guarded(fn) { return async (...args) => { try { await fn(...args); } catch(e) { message(e.message); } }; }
function invalidate() { revision++; results = []; current = 0; renderResults(); $('result-status').textContent = '조건이 변경되었습니다. 조합을 다시 찾아주세요.'; }
async function refresh() {
  const token = ++request;
  const params = new URLSearchParams({q:$('search').value,kind:$('kind').value,membership:$('membership').value,grade:$('grade').value});
  const response = planner ? await api('/api/search',{grade:$('grade').value,query:$('search').value,kind:$('kind').value,...planner.catalogFilters()}) : await api(`/api/courses?${params}`);
  if (token !== request) return;
  filtered = response; page = 0; renderCourses();
}
function renderCourses() {
  $('count').textContent = `${filtered.length}개 분반`;
  const pages = Math.max(1, Math.ceil(filtered.length/7));
  page = Math.min(page, pages-1);
  $('page').textContent = `${page+1} / ${pages}`;
  $('previous').disabled = page === 0; $('next').disabled = page === pages-1;
  $('courses').innerHTML = filtered.slice(page*7,page*7+7).map(c => {
    const reqs = planner?planner.requirementsFor(c):[...new Set(c.observations.map(o => o.requirement))];
    const added=planner?planner.has(codeKey(c)):selected.has(codeKey(c));
    return `<article class="course-card"><div>${reqs.map(r=>`<span class="badge">${esc(r)}</span>`).join('')}${c.timeStatus!=='parsed'?'<span class="badge warn">시간 확인</span>':''}${c.conflict?'<span class="badge warn">자료 충돌</span>':''}<button class="course-title text-button" data-detail="${esc(c.id)}">${esc(c.name)}</button><div class="course-meta">${esc(c.code)} · ${esc(c.section)}분반 · ${esc(c.instructor || '교수 미지정')} · ${esc(c.creditsRaw)}학점${planner?' · 앱 계산: '+esc(planner.creditLabel(c)):''}<br>${esc(timeLabel(c))} ${c.room?' / '+esc(c.room):''}${c.remarks?'<br>비고: '+esc(c.remarks):''}</div></div><div class="course-actions"><button class="add" data-add="${esc(c.id)}" ${added?'disabled':''}>${added?'담김':'＋ 담기'}</button><button class="text-button" data-detail="${esc(c.id)}">강좌 상세</button>${planner?.extraActions(c)||''}</div></article>`;
  }).join('') || '<div class="empty">검색 결과가 없습니다.<br><small>검색어나 조회 범위를 바꿔보세요.</small></div>';
}
function renderSelected() {
  $('selected-count').textContent = `${selected.size} / 8`;
  $('selected').innerHTML = [...selected].map(([key, fixed]) => {
    const sections = data.courses.filter(c => codeKey(c)===key);
    return `<div class="selected-item"><div class="selected-title">${esc(sections[0]?.name || key)}<button class="remove" data-remove="${esc(key)}" aria-label="${esc(sections[0]?.name)} 삭제">×</button></div><label>분반 선택<select data-fixed="${esc(key)}"><option value="">가능한 모든 분반에서 찾기</option>${sections.map(c=>`<option value="${esc(c.id)}" ${fixed===c.id?'selected':''}>${esc(c.section)}분반 · ${esc(c.instructor)} · ${esc(timeLabel(c))}${c.conflict?' (자료 충돌)':''}</option>`).join('')}</select></label></div>`;
  }).join('') || '<p class="hint">관심 과목을 최대 8개 담아보세요.<br>같은 과목의 분반 중 하나씩 조합합니다.</p>';
  renderCourses();
}
function showDetails(id) {
  const c = data.courses.find(c=>c.id===id);
  const sourceMap = new Map(data.sources.map(s=>[s.id,s]));
  $('detail-body').innerHTML = `<h3>${esc(c.name)} · ${esc(c.section)}분반</h3><p>${esc(c.instructor)} / ${esc(c.creditsRaw)}학점 / ${esc(c.timeRaw || '시간 미지정')} / ${esc(c.room)}</p><p class="notice">비고: ${esc(c.remarks || '기재 없음')}<br>공식 개설전공·공식 교양영역: 미확인. 아래는 조회에 포함된 출처입니다. 수강 자격을 보장하지 않습니다.</p>${planner?.detailActions(c)||''}${c.observations.map(o=>`<details><summary>${esc(o.requirement)} · ${esc(sourceMap.get(o.sourceId)?.file)}</summary><p>강좌 행 학년: ${esc(o.gradeRaw)} / 조회학년: ${esc(o.query.grade?.label || '미확인')}${o.query.gradeDisabled?' (선택창 비활성)':''}<br>조회 소속: ${esc(o.query.major?.label || o.query.faculty?.label || '없음')} / 조회영역: ${esc(o.query.area?.label || '없음')}</p><p>${esc(sourceMap.get(o.sourceId)?.issues.join(' / '))}</p><pre>${esc(JSON.stringify(o.departmentEvidence,null,2))}</pre></details>`).join('')}`;
  if(!$('details').open)$('details').showModal();
}
function conditions() {
  const excluded = $('excluded').value.trim().split(',').filter(v=>v.trim()).map(v=>{
    const m = v.trim().match(/^([월화수목금토일])(\d{1,2})$/);
    if (!m || Number(m[2])<1 || Number(m[2])>20) throw Error('제외 교시는 월1, 화3처럼 요일과 1~20 교시를 입력해주세요.');
    return {day:m[1],period:Number(m[2])};
  });
  return {selected:[...selected.keys()],fixed:Object.fromEntries([...selected].filter(([,v])=>v)),freeDays:[...document.querySelectorAll('#free-days input:checked')].map(x=>x.value),excluded,grade:$('grade').value};
}
function renderResults() {
  $('candidate-tabs').innerHTML = results.map((r,i)=>`<button data-candidate="${i}" class="secondary ${i===current?'active':''}">후보 ${i+1} · ${r.days}일 / 빈 ${r.gaps}교시</button>`).join('');
  const r = results[current];
  $('metrics').innerHTML = r ? `<span>${r.credits} 학점</span><span>주 ${r.days}일 등교</span><span>빈 교시 ${r.gaps}</span>` : '';
  if (!r) { $('timetable').innerHTML = '<div class="empty">표시할 시간표가 없습니다.</div>'; $('result-notes').textContent=''; return; }
  const courses = r.ids.map(id=>data.courses.find(c=>c.id===id)).filter(Boolean);
  const days = ['월','화','수','목','금',...['토','일'].filter(d=>courses.some(c=>c.slots.some(s=>s.day===d)))];
  const maxPeriod = Math.max(9,...courses.flatMap(c=>c.slots.map(s=>s.period)));
  $('timetable').innerHTML = `<table class="schedule"><thead><tr><th>교시</th>${days.map(d=>`<th>${d}</th>`).join('')}</tr></thead><tbody>${Array.from({length:maxPeriod},(_,p)=>`<tr><td>${p+1}</td>${days.map(day=>`<td>${courses.map((c,i)=>c.slots.some(s=>s.day===day&&s.period===p+1)?`<div class="class-block tone-${i%6}"><strong>${esc(c.name)}</strong><br>${esc(c.section)}분반 · ${esc(c.room)}</div>`:'').join('')}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
  $('result-notes').innerHTML = '<p class="result-note">실제 시각을 추정하지 않은 교시 기준 시간표입니다. 자료 갱신 후에는 다시 조합하세요.</p>'+courses.map(c=>`<div class="result-note">${esc(c.name)}: ${esc(c.remarks || '비고 기재 없음')} <button class="text-button" data-detail="${esc(c.id)}">출처 확인</button></div>`).join('');
}
function renderData() {
  const s = data.stats;
  $('data-stats').textContent = `${s.files}개 파일 · ${s.rows}개 원본 행 → ${s.offerings}개 강좌·분반 / 중복 ${s.duplicates}행 / 충돌 ${s.conflictKeys}건`;
  $('source-list').innerHTML = data.sources.map(s=>`<div class="source"><b>${esc(s.file)}</b> · ${s.rows}행<small>${esc(s.issues.join(' / ') || '읽기 완료 · 수집 완전성 미확인')}</small></div>`).join('');
}
async function installData(next) {
  data = next;
  if(!planner)planner=createPlanner({getData:()=>data,api,message,refresh,showDetails,renderCatalog:renderCourses});
  else planner.dataChanged();
  await refresh(); renderData();
  const meta=await api('/api/metadata');
  if(!$('dataset-info')){const el=document.createElement('p');el.id='dataset-info';el.className='hint';document.querySelector('.workspace').before(el);}
  $('dataset-info').textContent=`자료 학기: ${meta.terms.join(', ')} · 앱 적재: ${meta.lastImport?.loadedAt||'미확인'} · 원본 수집일: 미확인`;

}
$('free-days').innerHTML = ['월','화','수','목','금'].map(d=>`<label class="day"><input type="checkbox" value="${d}" aria-label="${d}요일 공강"><span>${d}</span></label>`).join('');
for (const id of ['search','kind','membership','grade']) $(id).addEventListener(id==='search'?'input':'change',guarded(refresh));
$('previous').onclick=()=>{page--;renderCourses();}; $('next').onclick=()=>{page++;renderCourses();};
document.addEventListener('click',e=>{
  const button=e.target.closest('button'); if(!button)return;
  if(button.dataset.add) {
    if(planner){planner.add(data.courses.find(c=>c.id===button.dataset.add));return;}
    if(selected.size>=8) return message('과목은 최대 8개 선택할 수 있습니다.');
    const c=data.courses.find(c=>c.id===button.dataset.add); selected.set(codeKey(c),''); renderSelected();invalidate();message();
  }
  if(button.dataset.remove) {selected.delete(button.dataset.remove);renderSelected();invalidate();}
  if(button.dataset.detail) showDetails(button.dataset.detail);
  if(button.dataset.candidate!==undefined){current=Number(button.dataset.candidate);renderResults();}
});
$('selected').onchange=e=>{if(e.target.dataset.fixed){selected.set(e.target.dataset.fixed,e.target.value);invalidate();}};
$('free-days').onchange=invalidate; $('excluded').oninput=invalidate;
$('generate').onclick=guarded(async()=>{
  const payload=conditions(), requestedRevision=revision; message(); $('generate').disabled=true;
  try {const response=await api('/api/generate',payload);if(requestedRevision!==revision)return;results=response.results;current=0;renderResults();$('result-status').textContent=`${response.complete?'탐색 완료':'탐색 제한 도달'} · ${response.nodes}개 탐색 노드 · 찾은 조합 ${response.found}개 중 ${results.length}개 표시. ${response.reasons.join(' / ')}`;}
  finally {$('generate').disabled=false;}
});
$('save').onclick=guarded(()=>{
  if(!results[current])throw Error('저장할 시간표 후보를 먼저 만들어주세요.');
  localStorage.setItem('ulsan-timetable-v2',JSON.stringify({fingerprint:data.fingerprint,conditions:conditions(),result:results[current]}));message('현재 후보와 조합 조건을 이 브라우저에 저장했습니다.');
});
$('load').onclick=guarded(async()=>{
  const saved=JSON.parse(localStorage.getItem('ulsan-timetable-v2')||'null');if(!saved)throw Error('저장한 시간표가 없습니다.');
  const p=saved.conditions;selected=new Map(p.selected.map(k=>[k,p.fixed[k]||'']));
  if(p.selected.some(k=>!data.courses.some(c=>codeKey(c)===k)))throw Error('저장된 과목이 현재 자료에 없습니다. 자료를 확인해주세요.');
  $('grade').value=p.grade;$('excluded').value=p.excluded.map(s=>s.day+s.period).join(', ');
  document.querySelectorAll('#free-days input').forEach(x=>{x.checked=p.freeDays.includes(x.value);});
  renderSelected();await refresh();invalidate();
  const verify=await api('/api/generate',{...p,fixed:Object.fromEntries(saved.result.ids.map(id=>{const c=data.courses.find(c=>c.id===id);return [c?codeKey(c):id,id];}))});
  if(verify.results.length){results=verify.results;current=0;renderResults();$('result-status').textContent='저장한 후보를 현재 자료와 조건으로 다시 검증했습니다.';}
  else {$('result-status').textContent='저장 후보를 현재 자료로 재현할 수 없습니다. 조합을 다시 찾아주세요.';}
  message(saved.fingerprint!==data.fingerprint?'데이터가 변경되었습니다. 저장 후보를 현재 데이터로 재검증했습니다.':'저장한 조건과 시간표를 불러왔습니다.');
});
$('manage').onclick=()=>{$('data-dialog').showModal();};$('close-data').onclick=()=>{$('data-dialog').close();};$('close-details').onclick=()=>{$('details').close();};$('print').onclick=()=>window.print();
$('reimport').onclick=guarded(async()=>{await installData(await api('/api/import',{directory:true,mode:$('import-mode').value}));message('원본 폴더를 다시 읽었습니다.');});
$('upload').onchange=guarded(async e=>{
  const files=await Promise.all([...e.target.files].map(async f=>({name:f.name,content:await f.text()})));
  if(files.length) {await installData(await api('/api/import',{files,mode:$('import-mode').value}));message('TXT를 통합했습니다. 자료 관리에서 출처와 점검 결과를 확인하세요.');} e.target.value='';
});
$('export').onclick=()=>{const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='courses.master.json';a.click();URL.revokeObjectURL(url);};
guarded(async()=>{await installData(await api('/api/data'));})();

$('data-dialog').querySelector('.import-actions').insertAdjacentHTML('beforebegin','<label>갱신 방식<select id="import-mode"><option value="merge">기존 자료와 병합 (기본)</option><option value="replace_sources">같은 파일·조회조건을 새 정상 응답으로 교체</option></select></label><p class="hint">교체한 이전 버전은 DB 이력에 보존됩니다. 새 응답에 없는 강좌는 현재 출처에서 빠지지만 다른 정상 출처는 유지합니다. 학교의 폐강 확정을 뜻하지 않습니다.</p><button id="import-history" class="secondary">가져오기 이력·변경 결과</button><div id="import-report"></div>');
$('import-history').onclick=guarded(async()=>{const rows=await api('/api/imports');$('import-report').innerHTML=rows.map(r=>`<details><summary>${esc(r.loadedAt)} · ${esc(r.mode)} · 추가 ${r.added.length} / 변경 ${r.changedVariants.length} / 현재 제외 ${r.removedFromActive.length} / 동일 해시 ${r.duplicateHashes}</summary><pre>${esc(JSON.stringify(r,null,2))}</pre></details>`).join('')||'적재 이력이 없습니다.';});
