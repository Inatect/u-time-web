import {candidateGallery} from './candidate-view.mjs?v=8d063b0d1d88b29c';
import {clone,blankPlan,loadState,saveState,checkpoint,removeCourse,applyReplacement,undo,validateFillResponse,generationRequired,replaceDraftCourse,pinDraftCourse,resetDialogConditions} from './state.mjs?v=8d063b0d1d88b29c';
const $=id=>document.getElementById(id);
const e=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const subject=c=>`${c.year}-${c.semester}:${c.code}`;
const areaOf=c=>[...new Set(c.observations.map(o=>o.query.area?.label).filter(Boolean))];
const EXT='자유교양(외부교류기관 교양강좌)';
const values=id=>[...$(id).selectedOptions].map(o=>o.value);
const options=(items,selected=[])=>items.map(x=>`<option value="${e(x)}" ${selected.includes(x)?'selected':''}>${e(x)}</option>`).join('');

export function createPlanner({getData,api,message,refresh,showDetails,renderCatalog}){
  let state=loadState(localStorage),revision=0,inspection=null,replacement=null,preview=null,busy=false;
  const data=()=>getData(), active=()=>state.plans[state.active], cond=()=>({...clone(active().conditions),completed:[...state.completed]});
  const effectiveClock=p=>Object.keys(p.timeMapping?.periods||{}).length?p.timeMapping:data().defaultTimeMapping;
  const courseKind=c=>c.curriculum?c.app_credit_by_profile?.[active().conditions.majorProfile]||'unknown':active().conditions.creditCategories?.[subject(c)]==='general'&&c.app_credit_categories?.includes('general')?'general':c.app_credit_by_profile?.[active().conditions.majorProfile]||c.app_credit_category||'unknown';
  const find=id=>data().courses.find(c=>c.id===id);
  const guard=fn=>async(...args)=>{try{await fn(...args);}catch(error){message(error.message);}};
  const save=()=>saveState(localStorage,state);
  const tracks=()=>[...new Set(data().courses.flatMap(c=>c.observations.filter(o=>c.app_credit_categories?.includes('major')).flatMap(o=>[o.query.major?.label,o.query.faculty?.label]).filter(Boolean)))].sort();
  const areas=()=>[...new Set(data().courses.flatMap(areaOf))].sort();
  const profs=()=>[...new Set(data().courses.map(c=>c.instructor).filter(Boolean))].sort();
  const rowName=c=>c?`${c.name} · ${c.section}분반 · ${c.instructor}`:'현재 자료에 없는 강좌';
  const targets=()=>['total','major','general','other'].map((k,i)=>`<tr><th>${['총','전공','교양','타전공·기타'][i]}</th>${['target','min','max'].map(f=>`<td><input type="number" min="0" step="0.5" aria-label="${['총','전공','교양','타전공·기타'][i]} ${f==='target'?'목표':f==='min'?'최소':'최대'}학점" id="target-${k}-${f}" placeholder="${k==='total'?'필수':'선택'}"></td>`).join('')}</tr>`).join('');
  const scope=document.createElement('section');scope.className='panel planner-scope';
  scope.innerHTML=`<div class="section-head"><h2>학점 계산과 자동 후보 범위</h2><span class="hint">목록 검색·필터와 별도로 적용</span></div><div class="planner-grid"><label>이전 학기 전공 후보 트랙 (2026-2는 교과과정 기준)<select id="tracks" multiple size="4"></select></label><label>자동 후보 교양영역 (미선택 = 모든 영역)<select id="auto-areas" multiple size="4"></select></label><div><p class="hint">2026년 2학기 IT융합·AI융합 교과과정의 전필·전선만 전공으로 계산합니다. 교필·교선 및 교양영역 수집 강좌는 교양, 기필·기선은 기타로 계산합니다. 전공 선택을 바꾸면 기존 시간표는 유지하고 학점을 다시 계산합니다. 졸업요건 인정 판정은 아닙니다.</p><button id="open-constraints" class="secondary">교수·수강이력·점심·시간 기준 설정</button></div></div></section>`;
  document.querySelector('.workspace').before(scope);
  scope.insertAdjacentHTML('afterbegin','<label>편성 학기<select id="plan-term"></select></label>');
  $('plan-term').onchange=guard(async()=>{active().conditions.term=$('plan-term').value;renderForm();await changed();await refresh();});
  $('membership').parentElement.firstChild.textContent='교양 세부영역 (목록)';
  const filters=document.createElement('div');filters.className='filters more-filters';
  filters.innerHTML='<label>교양 상위영역 (목록)<select id="area-top"><option value="">전체</option></select></label><label>교수 복수 필터 (목록 전용)<select id="list-profs" multiple size="3"></select></label><label>학점 (목록)<input id="list-credits" type="number" min="0" step="0.5" placeholder="전체"></label>';
  document.querySelector('.filters').after(filters);
  filters.insertAdjacentHTML('beforebegin',`<div id="major-browser" class="filters" hidden><label>학부·전공군<select id="major-group"><option>ICT융합학부</option></select></label><label>세부전공<select id="major-family"><option value="ict">전체</option><option value="it">IT융합전공</option><option value="computer">컴퓨터공학</option><option value="ai">AI융합</option></select></label><label>트랙<select id="major-track"><option value="all">전체</option><option value="basic">기본트랙</option><option value="integrated">통합트랙</option></select></label><small>목록 검색용 묶음 · 학점 기준과 자동 후보는 유지됩니다.</small></div>`);
  const listGroup=()=>{const f=$('major-family').value;return f==='it'?'it':f==='ict'?'ict-all':`${f}-${$('major-track').value}`;};
  const listTracks=()=>{const f=$('major-family').value,t=$('major-track').value;return f==='ict'?['IT융합전공','컴퓨터공학기본트랙','컴퓨터공학통합트랙','인공지능기본트랙','인공지능통합트랙']:f==='it'?['IT융합전공']:(t==='all'?['기본','통합']:[t==='basic'?'기본':'통합']).map(x=>(f==='computer'?'컴퓨터공학':'인공지능')+x+'트랙');};
  for(const id of ['major-family','major-track'])$(id).onchange=guard(refresh);

  document.querySelector('.builder').innerHTML=`<div class="section-head"><h2>02 <span>목표와 지정 강좌</span></h2><span id="selected-count" class="count"></span></div><label>학점 모드<select id="credit-mode"><option value="exact">정확히 맞추기</option><option value="flexible">허용 범위 안에서 추천</option></select></label><table class="target-table"><thead><tr><th>학점</th><th>목표</th><th>최소</th><th>최대</th></tr></thead><tbody>${targets()}</tbody></table><p class="hint target-help">전공·교양·타전공·기타 목표는 선택사항입니다. 비워두면 총학점만 맞춥니다.</p><div id="input-error" role="alert"></div><div id="credit-status" class="notice"></div><div id="selected" class="selected-list"></div><fieldset><legend>공강 요일</legend><div id="free-days" class="days">${[...'월화수목금토일'].map(d=>`<label class="day"><input type="checkbox" value="${d}" aria-label="${d}요일 공강"><span>${d}</span></label>`).join('')}</div></fieldset><label>제외 교시<input id="excluded" placeholder="예: 월1, 화3"></label><div id="session-excluded" class="hint"></div><p class="hint">강좌를 담으면 분반까지 고정됩니다. ‘과목만 필수’로 바꾸면 분반 변경을 허용합니다. 시간 미확인 강좌는 자유시간으로 처리하지 않습니다.</p><button id="auto-generate" class="primary">목표학점까지 자동 채우기 →</button><p id="run-status" role="status" aria-live="polite"></p><button id="section-generate" class="secondary full">담은 과목들의 분반만 조합</button><button id="scenario-generate" class="secondary full">인터넷강의 성공 A / 실패 B 생성</button><div id="scenario-selection" class="hint"></div>`;
  $('auto-generate').insertAdjacentHTML('beforebegin','<label class="checkline"><input id="exclude-internet" type="checkbox">인터넷 강의 제외</label><p class="hint">검색·자동 추가·교체 후보에 적용합니다. 직접 지정한 강좌는 유지합니다. 시간 미등록 강좌의 인터넷 분류는 사용자 지정 기준입니다.</p>');
  document.querySelector('.results .section-head').insertAdjacentHTML('afterend',`<div class="plan-toolbar"><label>독립 시간표<select id="plan-select"></select></label><button id="new-plan" class="secondary">현재 안 복사</button><button id="save-plan" class="secondary">수정 시간표 저장</button><button id="undo-plan" class="secondary">되돌리기</button><button id="refill-plan" class="secondary">남은 강좌 유지하고 다시 채우기</button><button id="find-open" class="secondary">빈 시간 강좌 찾기</button></div><p class="hint">편집 초안은 학점 미달 상태로 유지할 수 있습니다. 삭제한 과목은 이번 조합에서 제외됩니다. 전체 재조합은 위 생성 버튼으로만 실행합니다.</p><div id="compare-plans"></div>`);
  const settings=document.createElement('dialog');settings.id='constraints-dialog';
  settings.innerHTML=`<div class="dialog-head"><h2>시간표에 실제 적용할 조건</h2><button id="reset-constraints" class="secondary" type="button">조건 설정 초기화</button><button id="close-constraints" class="secondary">설정 적용·닫기</button></div><p class="hint">초기화는 이 창의 교수·점심·시간·추천 중요도·제외 과목·재수강 예외를 기본값으로 되돌립니다. 담은 강좌·고정·목표학점·공강일·인터넷 제외·수강이력은 유지됩니다. 목록의 교수 필터와 별개입니다. 복수 선택은 Ctrl 키 또는 Command 키를 사용하세요.</p><div class="planner-grid"><label>선호 교수<select id="preferred-profs" multiple size="5"></select></label><label>제외 교수<select id="excluded-profs" multiple size="5"></select></label><label>허용 교수<select id="allowed-profs" multiple size="5"></select><span class="checkline"><input id="only-profs" type="checkbox">선택한 교수만 허용</span></label></div><h3>수강이력과 제외과목</h3><p class="hint">강좌 카드에서 ‘이전 수강’ 또는 ‘과목 제외’를 눌러 등록합니다. 과목번호가 같은 모든 분반에 적용하며 비슷한 이름의 다른 과목을 자동 제외하지 않습니다.</p><div id="history-list"></div><div id="excluded-list"></div><h3>점심시간 비우기</h3><label class="checkline"><input id="lunch-enabled" type="checkbox">필수 조건으로 적용</label><div class="planner-grid"><label>시작<input id="lunch-start" type="time"></label><label>종료<input id="lunch-end" type="time"></label><fieldset><legend>점심 적용 요일</legend><div id="lunch-days" class="days">${[...'월화수목금토일'].map(d=>`<label class="day"><input type="checkbox" value="${d}" aria-label="점심 ${d}요일"><span>${d}</span></label>`).join('')}</div><button id="lunch-weekdays" class="secondary" type="button">평일 전체 선택</button></fieldset></div><label class="checkline"><input id="lunch-prefer" type="checkbox">필수 해제 시 점심 확보를 선호 점수에 반영</label><h3>시간 선호</h3><p class="hint">이른 시작 제외는 필수조건입니다. 기준 시각 이전에 시작하는 수업은 포함하지 않습니다. 고정 강좌와 충돌하거나 학점을 채울 수 없으면 실패 이유를 표시합니다. 늦은 종료 피하기는 선호조건입니다. 시간 미지정 강좌의 실제 일정은 별도 확인이 필요합니다. 적용 후 다시 생성하세요.</p><div class="planner-grid"><label><span class="checkline"><input id="early-enabled" type="checkbox">기준보다 이른 시작 제외 (필수)</span><input id="early-before" type="time"></label><label><span class="checkline"><input id="late-enabled" type="checkbox">기준보다 늦은 종료 피하기</span><input id="late-after" type="time"></label></div><p id="clock-guidance" class="notice" role="status"></p><button id="settings-clock" class="secondary">교시표 관리 (선택)</button>`;
  settings.insertAdjacentHTML('beforeend',`<h3>추천 중요도</h3><label>추천 방식<select id="scoring-mode"><option value="legacy">기존 우선순위 유지</option><option value="weighted">내 중요도로 점수 계산</option></select></label><div class="planner-grid">${[['days','등교일 줄이기'],['gaps','빈 시간 줄이기'],['professors','선호 교수'],['early','이른 수업 피하기'],['late','늦은 수업 피하기'],['lunch','점심 확보']].map(([k,label])=>`<label>${label}<select id="weight-${k}">${[0,1,2,3,4,5].map(n=>`<option value="${n}">${n} · ${['반영 안 함','낮음','보통','중요','높음','매우 중요'][n]}</option>`).join('')}</select></label>`).join('')}</div><p class="hint">필수조건을 통과한 후보끼리만 점수를 비교합니다. 시각 선호는 확인한 교시 시각표와 기준 시각이 필요합니다. 탐색 한도 내 발견 후보의 순위입니다.</p><h3>재수강 예외</h3><label>다시 포함할 과목번호 (쉼표 구분)<input id="retake-codes" placeholder="예: EN0025"></label><p class="hint">이전 수강 제외만 해제합니다. 학교의 재수강 자격이나 성적 처리 보장은 아닙니다.</p>`);
  document.body.append(settings);
  const advanced=document.createElement('dialog');advanced.id='advanced-dialog';
  advanced.innerHTML=`<div class="dialog-head"><h2>데이터 관리 · 시간 기준</h2><button id="close-advanced" class="secondary">적용·닫기</button></div><div id="time-reference"></div><h3>교시별 실제 시각과 근거</h3><p class="hint">사용자가 제공한 기본 교시표를 사용합니다. 별도 입력 없이 점심·시각 선호를 사용할 수 있습니다. 이곳에서는 사용자 지정표를 관리합니다. 예시 형식: 교시 시작 종료. A/B는 각각 별도 행으로 입력합니다. 미등록 교시의 강좌는 시각 계산에서 제외되고 이유가 표시됩니다. 모든 교시를 비우면 사용자 제공 기본표로 돌아갑니다. 10교시와 A/B는 확인된 대응표가 없으면 제외합니다.</p><label>확인한 자료 또는 출처<input id="time-source" placeholder="학교 교시표 URL 또는 확인한 문서명"></label><label>교시 시각표 (한 줄에 하나)<textarea id="time-periods" rows="8" placeholder="교시 시작시각 종료시각"></textarea></label><h3>비동기 확인 기록</h3><p class="hint">인터넷 영역·시간 빈칸만으로 비동기라고 판단하지 않습니다. 원문·출처를 확인한 뒤 아래 근거를 남길 수 있습니다. 실시간 강좌의 시간은 이 설정으로 없애지 않습니다.</p><label>강좌<select id="async-course"></select></label><label>비동기임을 확인한 근거<input id="async-evidence" placeholder="수업계획서 등의 명시 문구와 확인 출처"></label><button id="confirm-async" class="secondary">확인 기록 추가</button><div id="async-list"></div>`;
  document.body.append(advanced);
  $('data-dialog').querySelector('.dialog-head').insertAdjacentHTML('afterend','<button id="open-advanced" class="secondary">교시표와 시간 확인 자료</button>');
  $('open-advanced').onclick=guard(async()=>{renderSettings();const r=await api('/api/time-reference');$('time-reference').innerHTML=`<h3>${e(r.title)}</h3><p>${e(r.note)}</p><a href="${e(r.source)}" target="_blank" rel="noreferrer">공식 자료 보기</a><p>출처 학기 ${e(r.sourceTerm)} · 확인 ${e(r.checkedOn)}</p><details><summary>참고 시각표 보기</summary>${Object.entries(r.periods).map(([k,v])=>`<p>${k}교시 ${v.join('–')}</p>`).join('')}</details>`;advanced.showModal();});
  $('close-advanced').onclick=guard(async()=>{collectSettings();await changed();advanced.close();});

  const edit=document.createElement('dialog');edit.id='replacement-dialog';
  edit.innerHTML=`<div class="dialog-head"><h2>남은 시간표에 맞는 강좌</h2><button id="cancel-replace" class="secondary">취소·닫기</button></div><p id="replacement-context"></p><div class="filters"><label>분류<select id="replace-kind"><option value="">전체</option><option value="major">전공</option><option value="general">교양</option></select></label><label>영역<select id="replace-area"><option value="">전체</option></select></label><label>학점<input id="replace-credits" type="number" min="0" step="0.5"></label><label>교수·과목 검색<input id="replace-query" type="search"></label></div><label>교체 검색 전공·트랙<select id="replace-tracks" multiple size="3"></select></label><label>교수<select id="replace-professors" multiple size="3"></select></label><label class="checkline"><input id="replace-preferred" type="checkbox">선호 교수만</label><div class="filters"><label>이 시각 이후 시작<input id="replace-after" type="time"></label><label>이 시각 이전 종료<input id="replace-before" type="time"></label></div><label class="checkline"><input id="replace-same-time" type="checkbox">기존 강좌와 같은 요일·시각만 (선택)</label><p id="replacement-status" role="status"></p><details><summary>교체 후보 진단 (개발용)</summary><pre id="replacement-diagnostics"></pre></details><button id="search-replacements" class="secondary full">검색 갱신</button><div id="replacement-list"></div><div id="replacement-preview"></div><button id="apply-replacement" class="primary" disabled>미리보기 확인 후 적용</button>`;
  document.body.append(edit);
  // Preserve controls/handlers while moving presentation into a schedule-first workspace.
  const workspace=document.querySelector('.workspace'),results=document.querySelector('.results');
  const stage=document.createElement('div');stage.className='schedule-stage';
  workspace.append(stage);stage.append(document.querySelector('.builder'),results);
  const fold=document.createElement('details');fold.className='conditions-scope';fold.innerHTML='<summary>학점 기준 · 자동 후보 범위</summary>';scope.replaceWith(fold);fold.append(scope);settings.append(fold);
  const open=$('open-constraints');document.querySelector('.builder .section-head').append(open);open.textContent='조건 설정';
  // The actual credit basis must remain visible beside the target fields.
  const trackLabel=$('tracks').closest('label');trackLabel.firstChild.textContent='이전 학기 후보 트랙 (2026-2 교과과정 우선)';
  document.querySelector('.target-table').before(trackLabel);
  trackLabel.insertAdjacentHTML('beforebegin','<label>나의 학점 계산 기준<select id="major-profile"><option value="it">IT융합</option><option value="ai">AI융합</option></select></label><p id="profile-change" class="hint">사용자 지정 계산 기준 · 공식 졸업요건 판정 아님</p>');
  $('major-profile').onchange=guard(async()=>{const before=new Map(active().ids.map(id=>[id,courseKind(find(id))]));active().conditions.majorProfile=$('major-profile').value;await changed();await refresh();$('profile-change').textContent='분류 변경: '+(active().ids.filter(id=>before.get(id)!==courseKind(find(id))).map(id=>find(id).name).join(', ')||'현재 강좌의 변경 없음');});
  trackLabel.insertAdjacentHTML('afterend','<button id="apply-list-tracks" class="secondary" hidden>목록의 전공을 학점 기준으로 적용</button><p id="auto-scope-summary" class="hint"></p>');
  $('apply-list-tracks').onclick=guard(async()=>{const selected=listTracks();for(const o of $('tracks').options)o.selected=selected.includes(o.value);collect();renderForm();await changed();await refresh();});
  $('free-days').insertAdjacentHTML('afterend','<label><input id="free-days-hard" type="checkbox" checked>공강 요일을 필수조건으로 적용 (해제하면 선호)</label>');
  settings.append($('free-days').closest('fieldset'),$('excluded').closest('label'));
  const tools=document.createElement('details');tools.className='extra-generation';tools.innerHTML='<summary>분반 조합 · 인터넷강의 시나리오</summary>';$('section-generate').before(tools);tools.append($('section-generate'),$('scenario-generate'),$('scenario-selection'));
  const chosen=document.createElement('details');chosen.innerHTML='<summary>고정 강좌 관리</summary>';$('selected').before(chosen);chosen.append($('selected'));
  const extraFilters=document.createElement('details');extraFilters.innerHTML='<summary>교수·학점 상세 검색</summary>';filters.before(extraFilters);extraFilters.append(filters);extraFilters.insertAdjacentHTML('beforeend','<button type="button" id="reset-detail-search" class="secondary">상세 검색 초기화</button><p class="hint">교수 선택과 학점은 함께 적용됩니다. 학점 입력 즉시 검색합니다.</p>');
  const mobile=document.createElement('nav');mobile.className='mobile-tabs';mobile.setAttribute('aria-label','화면 전환');mobile.innerHTML='<button data-mobile="search">강좌 검색</button><button data-mobile="schedule" aria-current="page">시간표</button><button data-mobile="conditions">조건</button>';workspace.before(mobile);document.body.dataset.mobile='schedule';
  mobile.onclick=event=>{const v=event.target.dataset.mobile;if(!v)return;if(v==='conditions'){$('open-constraints').click();return;}document.body.dataset.mobile=v;mobile.querySelectorAll('button').forEach(b=>b.setAttribute('aria-current',b.dataset.mobile===v?'page':'false'));};
  const tabs=document.createElement('div');tabs.className='view-tabs';tabs.setAttribute('role','tablist');tabs.innerHTML='<button role="tab" aria-selected="true" data-view="week">주간 시간표</button><button role="tab" aria-selected="false" data-view="saved">저장·성공/실패안</button><button role="tab" aria-selected="false" data-view="candidates">후보 비교</button>';
  results.querySelector('.section-head').after(tabs);results.dataset.view='week';
  tabs.onclick=event=>{if(!event.target.dataset.view)return;results.dataset.view=event.target.dataset.view;tabs.querySelectorAll('button').forEach(b=>b.setAttribute('aria-selected',String(b===event.target)));};


  // Move live controls without recreating IDs or replacing their event handlers.
  document.querySelector('#top-search').append($('search'));
  $('search').setAttribute('aria-label','과목명, 교수명, 과목코드 검색');
  $('search').placeholder='과목명, 교수명으로 강좌를 검색해보세요';
  document.querySelector('.search-label').remove();
  document.querySelector('#top-term').append($('plan-term').closest('label'));
  workspace.append(document.querySelector('.builder'));
  stage.prepend(results);
  const catalogFold=document.createElement('details');catalogFold.className='catalog-drawer';catalogFold.id='catalog-drawer';
  catalogFold.innerHTML='<summary>강좌 탐색 <span>실제 개설 강좌를 검색하고 시간표에 담아보세요</span></summary>';
  stage.append(catalogFold);catalogFold.append(document.querySelector('.catalog'));
  const creditCard=document.createElement('section');creditCard.className='credit-card';
  creditCard.innerHTML='<h2>학점 현황 <span>현재 시간표 기준</span></h2><div id="credit-overview" aria-live="polite"></div>';
  document.querySelector('.builder').before(creditCard);
  const rail=document.createElement('aside');rail.className='dashboard-rail';rail.setAttribute('aria-label','학점 현황과 시간표 조건');
  workspace.append(rail);rail.append(creditCard,document.querySelector('.builder'));
  document.querySelector('.builder h2 span').textContent='시간표 조건';
  results.querySelector('h2 span').textContent='주간 시간표';
  scope.querySelector('.planner-grid').prepend(trackLabel);
  scope.append($('auto-scope-summary'));
  const creditDetails=document.createElement('details');creditDetails.innerHTML='<summary>학점 상세 검사 결과</summary>';
  $('credit-status').before(creditDetails);creditDetails.append($('credit-status'));
  rail.querySelector('.builder').append($('free-days').closest('fieldset'));
  rail.querySelector('.builder').append($('excluded').closest('label'));
  $('auto-generate').before($('free-days').closest('fieldset'),$('excluded').closest('label'));
  const appTools=document.createElement('details');appTools.className='app-tools';appTools.innerHTML='<summary>앱 설치 · 백업 · 연결 상태</summary>';
  document.querySelector('footer').before(appTools);
  const relocateTools=()=>{const t=document.querySelector('.web-tools');if(t&&!appTools.contains(t))appTools.append(t);};
  relocateTools();const toolObserver=new MutationObserver(relocateTools);toolObserver.observe(document.querySelector('main'),{childList:true});
  function openCatalog(){catalogFold.open=true;document.body.dataset.mobile='search';mobile.querySelectorAll('button').forEach(b=>b.setAttribute('aria-current',b.dataset.mobile==='search'?'page':'false'));}
  mobile.addEventListener('click',event=>{if(event.target.closest('[data-mobile]')?.dataset.mobile==='search')openCatalog();});
  $('search').addEventListener('focus',openCatalog);
  $('search').addEventListener('input',openCatalog);
  document.querySelector('.sidebar nav').addEventListener('click',event=>{
    const b=event.target.closest('[data-nav]');if(!b)return;
    document.querySelectorAll('.sidebar nav button').forEach(x=>x.removeAttribute('aria-current'));b.setAttribute('aria-current','page');
  });
  document.querySelector('.sidebar').addEventListener('click',event=>{
    const nav=event.target.closest('[data-nav]')?.dataset.nav;if(!nav)return;
    if(nav==='data'){$('manage').click();return;}if(nav==='settings'){open.click();return;}
    if(nav==='search'){openCatalog();catalogFold.scrollIntoView({block:'start'});$('search').focus({preventScroll:true});return;}
    document.body.dataset.mobile='schedule';tabs.querySelector('[data-view="'+nav+'"]').click();results.scrollIntoView({block:'start'});
  });


  function persist(){state.fingerprint=data().fingerprint;save();}
  async function changed(){revision++;active().results=[];active().report=null;$('verified-alternatives')?.remove();$('run-status').textContent='조건 변경됨 · 현재 화면은 기존 초안입니다. 다시 생성해주세요.';persist();renderSelected();await inspect();}
  function collect(){
    const p=active().conditions;
    p.excludeInternet=$('exclude-internet').checked;p.tracks=values('tracks');p.generalAreas=values('auto-areas');p.creditMode=$('credit-mode').value;p.grade=$('grade').value;
    for(const k of ['total','major','general','other'])for(const f of ['target','min','max'])p.targets[k][f]=$(`target-${k}-${f}`).value.trim()===''?null:Number($(`target-${k}-${f}`).value);
    p.freeDaysHard=$('free-days-hard').checked;
    p.freeDays=[...document.querySelectorAll('#free-days input:checked')].map(x=>x.value);
    p.excluded=$('excluded').value.split(',').filter(x=>x.trim()).map(x=>{const m=x.trim().match(/^([월화수목금토일])(\d{1,2})$/);if(!m)throw Error('제외 교시는 월1, 화3처럼 입력해주세요.');return {day:m[1],period:Number(m[2])};});
  }
  function collectSettings(){
    const p=active().conditions;
    p.preferredProfessors=values('preferred-profs');p.excludedProfessors=values('excluded-profs');p.allowedProfessors=values('allowed-profs');p.onlyProfessors=$('only-profs').checked;
    p.lunch={enabled:$('lunch-enabled').checked,prefer:$('lunch-prefer').checked,days:[...document.querySelectorAll('#lunch-days input:checked')].map(x=>x.value),start:$('lunch-start').value,end:$('lunch-end').value};
    p.scoringMode=$('scoring-mode').value;p.weights=Object.fromEntries(['days','gaps','professors','early','late','lunch'].map(k=>[k,Number($('weight-'+k).value)]));p.retakeCodes=$('retake-codes').value.split(',').map(x=>x.trim()).filter(Boolean);
    if(($('early-enabled').checked&&!$('early-before').value)||($('late-enabled').checked&&!$('late-after').value))throw Error('사용할 시간 선호의 기준 시각을 입력해주세요.');
    p.preferences={earlyBefore:$('early-enabled').checked?$('early-before').value:'',lateAfter:$('late-enabled').checked?$('late-after').value:'',earlyValue:$('early-before').value,lateValue:$('late-after').value};
    const periods={};
    for(const line of $('time-periods').value.split('\n').filter(x=>x.trim())){
      const m=line.trim().match(/^(\d{1,2}[AB]?)\s+(\d{2}:\d{2})\s+(\d{2}:\d{2})$/);
      if(!m)throw Error('교시 시각표는 한 줄에 ‘교시 HH:MM HH:MM’ 형식으로 입력해주세요.');
      if(periods[m[1]])throw Error('교시 시각표에 중복 교시가 있습니다.');periods[m[1]]=[m[2],m[3]];
    }
    p.timeMapping={source:$('time-source').value.trim(),periods};
  }
  function renderForm(){
    document.querySelector('.semester').textContent='나만의 한 주';
    const p=active().conditions;$('exclude-internet').checked=!!p.excludeInternet;$('tracks').disabled=p.term==='2026-2';p.majorProfile??='it';p.targets.other??={target:null,min:null,max:null};$('major-profile').value=p.majorProfile;$('free-days-hard').checked=p.freeDaysHard!==false;
    $('auto-scope-summary').textContent=`자동 추가 전공 범위: ${p.term==='2026-2'?(p.majorProfile==='ai'?'AI융합':'IT융합')+' 2026-2 교과과정 전필·전선':p.tracks.length?p.tracks.join(', '):'수집 전공 전체 합집합'} · 자동 후보 교양영역: ${p.generalAreas.length?p.generalAreas.join(', '):'전체'} · 검색어·목록 필터는 생성 후보를 제한하지 않습니다.`;
    if(!busy)$('result-status').textContent=active().ids.length?`${state.active}안의 초안을 현재 자료·조건으로 검사합니다. 목표 미달 상태도 유지됩니다.`:'과목을 담거나 목표학점을 설정해 자동 채우기를 시작하세요.';
    $('plan-term').innerHTML=options([...new Set(data().courses.map(c=>`${c.year}-${c.semester}`))].sort().reverse(),[p.term]);
    $('tracks').innerHTML=options(tracks(),p.tracks);$('auto-areas').innerHTML=options(areas(),p.generalAreas);
    document.querySelector('.target-table').classList.toggle('exact-mode',p.creditMode==='exact');$('credit-mode').value=p.creditMode;$('grade').value=p.grade;
    for(const k of ['total','major','general','other'])for(const f of ['target','min','max']){$(`target-${k}-${f}`).value=p.targets[k][f]??'';$(`target-${k}-${f}`).disabled=f!=='target'&&p.creditMode==='exact';}
    document.querySelectorAll('#free-days input').forEach(x=>x.checked=p.freeDays.includes(x.value));
    $('excluded').value=p.excluded.map(x=>x.day+x.period).join(', ');
    $('plan-select').innerHTML=options(Object.keys(state.plans),[state.active]);
    renderSelected();renderScenario();
  }
  function renderSelected(){
    const p=active().conditions;$('selected-count').textContent=`지정 ${p.required.length}과목`;
    $('selected').innerHTML=p.required.map((r,index)=>{const sections=data().courses.filter(c=>subject(c)===r.subject);const c=find(r.id)||sections[0];return `<div class="selected-item"><div class="selected-title">${e(c?.name||r.subject)}<button class="remove" data-unrequire="${index}" aria-label="지정 해제">×</button></div><label>고정 상태<select data-required-mode="${index}"><option value="fixed" ${r.mode==='fixed'?'selected':''}>강좌 고정 (교수·분반·시간 유지)</option><option value="subject" ${r.mode==='subject'?'selected':''}>과목만 필수 (분반 변경 허용)</option></select></label><label>기준 분반<select data-required-id="${index}">${sections.map(c=>`<option value="${e(c.id)}" ${c.id===r.id?'selected':''}>${e(c.section)}분반 · ${e(c.instructor)} · ${e(c.timeRaw||'시간 미확인')}</option>`).join('')}</select></label></div>`;}).join('')||'<p class="hint">강좌를 담으면 기본적으로 해당 분반을 고정합니다. 아무 강좌도 고정하지 않고 목표학점부터 채울 수도 있습니다.</p>';
    $('session-excluded').innerHTML='이번 조합 제외: '+(p.sessionExcluded.map(code=>`<button class="secondary" data-release="${e(code)}">${e(code)} 해제</button>`).join(' ')||'없음');
    renderCatalog();
  }
  function renderSettings(){
    const p=active().conditions;
    for(const [id,key] of [['preferred-profs','preferredProfessors'],['excluded-profs','excludedProfessors'],['allowed-profs','allowedProfessors']])$(id).innerHTML=options(profs(),p[key]);
    $('scoring-mode').value=p.scoringMode||'legacy';for(const k of ['days','gaps','professors','early','late','lunch'])$('weight-'+k).value=p.weights?.[k]??(['early','late'].includes(k)?1:2);$('retake-codes').value=(p.retakeCodes||[]).join(', ');
    $('only-profs').checked=p.onlyProfessors;$('lunch-enabled').checked=p.lunch.enabled;$('lunch-start').value=p.lunch.start;$('lunch-end').value=p.lunch.end;
    for(const x of document.querySelectorAll('#lunch-days input'))x.checked=p.lunch.days.includes(x.value);$('lunch-prefer').checked=p.lunch.prefer??true;
    const clock=effectiveClock(p);const hasClock=Object.keys(clock.periods).length>0;$('clock-guidance').textContent=hasClock?'계산 기준: '+clock.source:'시각표 미등록: 입력은 가능하지만 점심 필수는 생성 시 오류로 안내하고, 시각 선호는 미적용으로 표시합니다. 교시 시각표와 근거를 등록하세요.';$('lunch-enabled').disabled=false;$('early-enabled').checked=!!p.preferences.earlyBefore;$('late-enabled').checked=!!p.preferences.lateAfter;$('early-before').disabled=false;$('late-after').disabled=false;
    $('early-before').value=p.preferences.earlyBefore||p.preferences.earlyValue||'10:00';$('late-after').value=p.preferences.lateAfter||p.preferences.lateValue||'17:00';
    $('time-source').value=clock.source;$('time-periods').value=Object.entries(clock.periods).map(([k,v])=>`${k} ${v.join(' ')}`).join('\n');
    const label=code=>`${code} ${data().courses.find(c=>c.code===code)?.name||''}`;
    $('history-list').innerHTML='이전 수강: '+(state.completed.map(code=>`<button class="secondary" data-history-remove="${e(code)}">${e(label(code))} 해제</button>`).join(' ')||'없음');
    $('excluded-list').innerHTML='제외 과목: '+(p.excludedCodes.map(code=>`<button class="secondary" data-exclude-remove="${e(code)}">${e(label(code))} 해제</button>`).join(' ')||'없음');
    $('async-course').innerHTML=data().courses.filter(c=>c.timeStatus==='unspecified').map(c=>`<option value="${e(c.id)}">${e(rowName(c))}</option>`).join('');
    $('async-list').innerHTML=Object.entries(p.asyncConfirmed).map(([id,v])=>`<p>${e(rowName(find(id)))}: ${e(v.type==='user_assumption'?'사용자 가정 (공식 확인 아님)':v.evidence)} <button class="secondary" data-async-remove="${e(id)}">확인 해제</button></p>`).join('');
  }
  function renderScenario(){
    $('scenario-selection').innerHTML='<b>성공 시에만 포함할 강좌</b><br>'+ (active().conditions.scenarioIds.map(id=>`<button class="secondary" data-scenario-remove="${e(id)}">${e(rowName(find(id)))} ×</button>`).join(' ')||'외부교류기관 영역의 카드에서 추가해주세요. 일반 고정강좌와 별도로 관리됩니다.');
  }
  async function inspect(){
    const token=++revision,p=cond();
    try{
      const info=await api('/api/inspect',{ids:active().ids,conditions:p});if(token!==revision)return;
      const pl=active();
      if(pl.creditPolicy!==data().creditPolicy&&pl.results.length){
        const checked=await Promise.all(pl.results.map(r=>api('/api/inspect',{ids:r.ids,conditions:p})));
        if(token!==revision)return;
        pl.results=pl.results.map((r,i)=>({...r,...checked[i],targetSatisfied:checked[i].valid,
          targetDifference:Object.fromEntries(Object.entries(checked[i].deltas).map(([k,v])=>[k,v.targetDifference])),
          recommendation:checked[i].valid?'사용자 지정 앱 학점 규칙으로 재검증 완료':'학점 규칙 변경 후 초안: '+checked[i].issues.join(' / ')}));
        pl.creditPolicy=data().creditPolicy;persist();
      }
      inspection=info;
      $('credit-status').innerHTML=['total','major','general','other'].map((k,i)=>{const x=info.deltas[k];if(x.target===null)return `${['총','전공','교양','타전공·기타'][i]} <b>${x.actual}</b> · 목표 미지정`;return `${['총','전공','교양','타전공·기타'][i]} <b>${x.actual}</b> / 목표 ${x.target} (목표 대비 ${x.targetDifference>=0?'+':''}${x.targetDifference})${x.short||x.over?` · 부족 ${x.short} / 초과 ${x.over}`:''}`;}).join(' &nbsp; · &nbsp; ');
      $('credit-overview').innerHTML=['total','major','general','other'].map((k,i)=>{
        const x=info.deltas[k],target=x.target,percent=target>0?Math.min(100,Math.max(0,x.actual/target*100)):0;
        return '<div class="credit-stat credit-'+k+'"><div><span>'+['총 이수 학점','전공','교양','타전공·기타'][i]+'</span><strong>'+e(x.actual)+'<small> / '+(target===null?'목표 미지정':e(target)+'학점')+'</small></strong></div><div class="credit-track" role="meter" aria-label="'+['총','전공','교양','기타'][i]+' 목표 대비 학점" aria-valuemin="0" aria-valuemax="100" aria-valuenow="'+percent+'" aria-valuetext="'+e(x.actual)+'학점, 목표 '+(target===null?'미지정':e(target)+'학점')+'"><span style="width:'+percent+'%"></span></div></div>';
      }).join('');
      draw();
      await compare();
    }catch(error){if(token!==revision)return;inspection=null;$('credit-status').textContent=error.message;$('credit-overview').textContent='학점 현황을 확인할 수 없습니다.';draw();}
  }
  function draw(){
    const a=active();$('candidate-tabs').innerHTML=candidateGallery(a.results,data().courses,a.conditions.required,a.ids);
    if(a.results.length){
      
      const reps=a.results;
      $('candidate-tabs').insertAdjacentHTML('beforeend',`<details class="candidate-comparison"><summary>전체 후보 비교와 추천 근거</summary><table class="comparison"><thead><tr><th>후보</th><th>총/전공/교양/기타</th><th>등교·공강</th><th>빈 시간</th><th>이른/늦은 수업</th><th>점심</th><th>점수·근거</th></tr></thead><tbody>${reps.map((r,i)=>`<tr><td><button data-planner-result="${i}">후보 ${i+1} 선택</button></td><td>${r.credits.total}/${r.credits.major}/${r.credits.general}/${r.credits.other??0}</td><td>${r.days}일 / ${(r.freeDays||[]).join(', ')||'없음'}</td><td>${r.gaps}${r.gapUnit}</td><td>${r.earlyCount??'미적용'} / ${r.lateCount??'미적용'}</td><td>${r.lunchSatisfied==null?'시각 미확인':r.lunchSatisfied?'확보':'겹침 '+r.lunchConflictMinutes+'분'}</td><td>${r.score?.toFixed(2)??'—'}점<br>${e(r.recommendation)}</td></tr>`).join('')}</tbody></table><p class="hint">새로 생성한 후보는 설정 범위를 충족합니다. 저장된 후보는 현재 학점 규칙으로 다시 검사하며, 미충족 후보는 초안으로 표시합니다.</p></details>`);
    }
    if(inspection){$('metrics').innerHTML=`<span>총 ${inspection.credits.total} · 전공 ${inspection.credits.major} · 교양 ${inspection.credits.general} · 타전공·기타 ${inspection.credits.other??0}${inspection.credits.unknown?' · 분류 미확인 '+inspection.credits.unknown:''}</span><span>${inspection.days}일 등교</span><span>빈 시간 ${inspection.gaps}${inspection.gapUnit} / 점심 ${inspection.lunchGap}${inspection.gapUnit}</span>`;}
    else $('metrics').textContent='조건 확인 필요';
    const chosenResult=a.results.find(r=>JSON.stringify([...r.ids].sort())===JSON.stringify([...a.ids].sort()))||inspection;
    if(a.conditions.scoringMode==='weighted'&&chosenResult?.scoreBreakdown){$('metrics').insertAdjacentHTML('beforeend',`<details><summary>추천 점수 ${chosenResult.score.toFixed(2)}/100 · 항목별 근거</summary>${Object.entries(chosenResult.scoreBreakdown).map(([k,v])=>`<p>${e(({days:'등교일',gaps:'빈 시간',professors:'선호 교수',early:'이른 수업',late:'늦은 수업',lunch:'점심 확보'})[k])}: 정규화 ${v.normalized.toFixed(3)} × 중요도 ${v.weight} → 기여 ${v.contribution.toFixed(2)}점</p>`).join('')}</details>`);}
    const courses=a.ids.map(find).filter(Boolean), asyncIds=new Set(inspection?.asyncIds||[]);
    const days=[...'월화수목금토일'].filter(d=>'월화수목금'.includes(d)||courses.some(c=>c.slots.some(s=>s.day===d)));
    const tokens=[...new Set(courses.flatMap(c=>c.slots.map(s=>String(s.period)+(s.part||''))))];
    // A/B labels remain separate; mixed whole/subperiod courses are validated in minutes.
    const periodTokens=[...new Set([...Array.from({length:9},(_,i)=>String(i+1)),...tokens])].sort((a,b)=>parseInt(a)-parseInt(b)||a.localeCompare(b));
    $('timetable').innerHTML=`<table class="schedule"><thead><tr><th>교시</th>${days.map(d=>`<th>${d}</th>`).join('')}</tr></thead><tbody>${periodTokens.map(token=>`<tr><td>${token}</td>${days.map(day=>`<td>${courses.map((c,i)=>!asyncIds.has(c.id)&&c.slots.some(s=>s.day===day&&String(s.period)+(s.part||'')===token)?`<button data-detail="${e(c.id)}" class="class-block tone-${i%6}"><strong>${e(c.name)}</strong><br>${e(c.section)}분반 · ${e(c.instructor)}${c.room?'<br>'+e(c.room):''}</button>`:'').join('')}</td>`).join('')}</tr>`).join('')}</tbody></table>`+(courses.length?'':'<div class="schedule-empty"><strong>나만의 한 주를 시작해볼까요?</strong><span>강좌를 검색하거나 오른쪽에서 목표 학점까지 자동으로 채워보세요.</span></div>');
    const issues=inspection?.issues||[];
    $('result-notes').innerHTML=(issues.length?`<div class="notice"><b>편집 중인 초안 · 확인할 조건</b><ul>${issues.map(x=>`<li>${e(x)}</li>`).join('')}</ul></div>`:'<p class="hint">'+(courses.length?'현재 설정 조건 충족 (수강 자격·졸업요건 판정 아님)':'강좌를 선택하거나 자동 채우기를 시작하세요.')+'</p>')+(courses.some(c=>c.timeStatus==='unspecified')?'<h3>시간 미지정 강좌</h3><p class="hint">강의시간 미등록 · 실제 일정 확인 필요. 계획용으로 격자와 충돌하지 않는다고 가정하며 학점에 포함합니다.</p>':'')+[...courses].sort((a,b)=>(b.timeStatus==='unspecified')-(a.timeStatus==='unspecified')).map((c,index,sorted)=>`${c.timeStatus!=='unspecified'&&index>0&&sorted[index-1].timeStatus==='unspecified'?'<h3>시간 지정 강좌</h3>':''}<article class="draft-course"><div><b>${e(rowName(c))}</b> ${a.autoIds.includes(c.id)?'<span class="badge">자동 추가</span>':''} ${asyncIds.has(c.id)?`<span class="badge">정해진 수업시간 없음 · ${a.conditions.asyncConfirmed[c.id]?.type==='user_assumption'?'사용자 가정':'확인 기록 있음'}</span>`:''}<p>${e(c.timeRaw||'강의시간 미등록 · 실제 일정 확인 필요')} · ${c.credits}학점 · ${e({major:'전공',general:'교양',other:'타전공·기타',unknown:'분류 미확인'}[courseKind(c)])}<br>비고: ${e(c.remarks||'기재 없음')}</p></div><div><button class="secondary" data-edit-remove="${e(c.id)}">삭제</button> <button class="secondary" data-edit-replace="${e(c.id)}">교체</button> <button class="secondary" data-copy-course="${e(c.id)}">과목명 + 교수명 복사</button></div></article>`).join('');
    $('undo-plan').disabled=!a.undo.length;
    $('compare-plans').innerHTML=Object.entries(state.plans).filter(([name])=>name.startsWith('A')||name.startsWith('B')).map(([name,pl])=>`<button class="secondary" data-open-plan="${e(name)}">${e(name)} · ${pl.report?.results?.[0]?.credits?.total??'—'}학점 (생성 기준)</button>`).join(' ');
  }
  async function run({sections=false,refill=false,scenario=false}={}){
    if(busy)return;busy=true;let p,token,name;
    $('run-status').textContent='시간표를 찾는 중…';$('input-error').textContent='';
    for(const id of ['auto-generate','section-generate','scenario-generate','refill-plan'])$(id).disabled=true;
    $('result-status').textContent='조건을 검사하고 발견한 추천 후보를 찾고 있습니다…';
    try{
      try{collect();}catch(error){error.kind='input';throw error;}p=cond();token=++revision;name=state.active;
      p.required=generationRequired(active(),data().courses,refill);
      p.sectionsOnly=sections;p.diverseTime=!sections;
      const response=await api(scenario?'/api/scenarios':'/api/plan',p);
      if(token!==revision||name!==state.active){$('run-status').textContent='조건이 변경되어 이전 결과를 적용하지 않았습니다. 다시 실행해주세요.';$('result-status').textContent=$('run-status').textContent;return;}
      if(scenario){
        const suffix=state.plans.A||state.plans.B?` ${new Date().toLocaleTimeString('ko-KR')}`:'';
        for(const label of ['A','B']){const result=response[label],next=blankPlan(result.conditions);next.report=result;next.results=result.results;next.ids=[...(result.results[0]?.ids||[])];next.autoIds=[...(result.results[0]?.autoIds||[])];state.plans[label+suffix]=next;}
        state.active='A'+suffix;renderForm();
        $('result-status').textContent=['A','B'].map(k=>`${k}: ${reportText(response[k])}`).join(' / ');
      }else{
          if(!sections)validateFillResponse(response,p,data().courses);
        active().report=response;active().results=response.results;
        if(response.results.length){checkpoint(active());active().ids=[...response.results[0].ids];active().autoIds=[...response.results[0].autoIds];if(refill)active().autoIds=active().ids.filter(id=>!active().conditions.required.some(r=>r.subject===subject(find(id))));}
        $('result-status').textContent=reportText(response);
        $('verified-alternatives')?.remove();
        if(response.verifiedAlternatives?.length)$('run-status').insertAdjacentHTML('afterend',`<div id="verified-alternatives">${response.verifiedAlternatives.map(x=>`<button class="secondary" data-relax="${e(x.action)}">${e(x.label)}하고 다시 생성</button>`).join('')}</div>`);
        renderSelected();
      }
        if(!scenario&&!response.results.length)$('result-status').textContent+=' · 새 시간표 미생성: 화면은 기존 초안입니다.';
        $('result-status').textContent+=' '+(response.timeWarnings||response.results?.[0]?.timeWarnings||[]).join(' ');$('run-status').textContent=$('result-status').textContent;
        if(response.diagnostics){let box=$('generation-diagnostics');if(!box){box=document.createElement('details');box.id='generation-diagnostics';$('run-status').after(box);}box.innerHTML='<summary>자동 생성 진단 (개발용)</summary><pre>'+e(JSON.stringify(response.diagnostics,null,2))+'</pre>';}
        persist();await inspect();await compare();
    }catch(error){const label={input:'입력 확인',timeout:'응답 시간 초과',server:'데이터·계산 오류',cancelled:'계산 취소'}[error.kind]||'실행 오류';$('run-status').textContent=`${label}: ${error.message}`;$('result-status').textContent=$('run-status').textContent;if(error.kind==='input')$('input-error').textContent=error.message;}
    finally{busy=false;for(const id of ['auto-generate','section-generate','scenario-generate','refill-plan'])$(id).disabled=false;}
  }
    function reportText(r){return `${r.mode==='sections'?'분반 조합 결과 · 추가 강좌 탐색 안 함 · 목표학점 충족 별도 확인':({success:'생성 성공',required_conflict:'필수조건 충돌',credit_infeasible:'학점·시간 조합 불가능',search_limit:'탐색 제한 · 가능 여부 미확정'})[r.resultState]||({found:'자동 채우기 완료',limited:'탐색 제한 도달 · 가능 여부 미확정',insufficient:'후보 학점 부족',infeasible:'조건 불충족'})[r.outcome]||'탐색 결과'} · ${r.complete?'탐색 완료':'탐색 제한 도달'} · 표시 ${r.results.length}개 · ${Math.round(r.elapsedMs)/1000}초 (후보 ${r.eligibleCourses??'?'}강좌) ${r.reasons.join(' ')} ${(r.verifiedAlternatives||[]).map(x=>'검증된 대안: '+x.label).join(' ')}`;}
  async function compare(){
    const entries=Object.entries(state.plans).filter(([name])=>name.startsWith('A')||name.startsWith('B'));
    const list=[];
    for(const [name,pl] of entries){
      try{const s=await api('/api/inspect',{ids:pl.ids,conditions:{...pl.conditions,completed:state.completed}});list.push(`<tr><td><button class="text-button" data-open-plan="${e(name)}">${e(name)}</button></td><td>${s.credits.total} / ${s.credits.major} / ${s.credits.general} / ${s.credits.other??0}</td><td>${s.days}일</td><td>${s.gaps}${s.gapUnit} (점심 ${s.lunchGap})</td><td>${s.valid?'조건 충족':'초안/조건 미충족'}</td></tr>`);}catch(error){list.push(`<tr><td>${e(name)}</td><td colspan="4">${e(error.message)}</td></tr>`);}
    }
    if(list.length)$('compare-plans').innerHTML='<table class="comparison"><thead><tr><th>안</th><th>총/전공/교양/기타</th><th>등교</th><th>빈 시간</th><th>현재 상태</th></tr></thead><tbody>'+list.join('')+'</tbody></table>';
  }
  async function openReplacement(id=null){
    collect();replacement={ids:[...active().ids],removeId:id,conditions:cond(),plan:state.active};preview=null;
    $('replacement-context').textContent=id?`${rowName(find(id))} 교체 · 다른 강좌는 그대로 유지합니다.`:'현재 초안을 유지하고 빈 시간에 들어갈 강좌를 찾습니다.';
    $('replace-tracks').innerHTML=options(tracks(),active().conditions.tracks);$('replace-professors').innerHTML=options(profs());$('replacement-status').textContent='';$('replacement-diagnostics').textContent='';$('search-replacements').disabled=false;$('replace-preferred').checked=false;$('replace-same-time').checked=false;$('replace-after').value='';$('replace-before').value='';$('replace-kind').value=id?courseKind(find(id)):'';$('replace-query').value='';$('replace-credits').value=id?find(id).credits:'';$('replace-area').innerHTML='<option value="">전체</option>'+options(areas());$('replacement-preview').textContent='';$('apply-replacement').disabled=true;
    edit.showModal();await searchReplacements();
  }
  async function searchReplacements(){
    if(!replacement){$('replacement-status').textContent='교체할 강좌를 먼저 선택해주세요.';return;}
    const kind=$('replace-kind').value;$('replace-tracks').disabled=kind!=='major';
    const context=replacement;preview=null;$('apply-replacement').disabled=true;$('search-replacements').disabled=true;$('replacement-list').textContent='';$('replacement-status').textContent='남은 전체 시간표와 대조 중…';
    try{
    const response=await api('/api/replacements',{...replacement,filters:{kind:$('replace-kind').value,area:$('replace-area').value,query:$('replace-query').value,credits:$('replace-credits').value,tracks:kind==='major'?values('replace-tracks'):[],professors:values('replace-professors'),preferredOnly:$('replace-preferred').checked,sameTime:$('replace-same-time').checked,after:$('replace-after').value,before:$('replace-before').value}});
    if(replacement!==context)return;
    $('replacement-status').textContent=`검색 완료: ${response.courses.length}개 · 시간 미확인 ${response.unknown.length}개. ${response.issues.join(' / ')}`;const d=response.diagnostics;$('replacement-status').textContent+=` · 검색조건 통과 ${d.filteredCourses}개 → 시간충돌 제외 ${d.conflictExcluded}개 · 필수조건 제외 ${d.hardExcluded}개. 기본값은 기존 강좌의 분류·학점입니다. 학점을 비우면 전체 학점을 검색합니다.`;$('replacement-diagnostics').textContent=JSON.stringify(response.diagnostics,null,2);
    replacement.remaining=response.remaining;preview=null;$('apply-replacement').disabled=true;$('replacement-preview').textContent='';
    $('replacement-list').innerHTML=response.issues.map(x=>`<p class="notice">${e(x)}</p>`).join('')+`<p>계획상 배치 가능한 ${response.courses.length}개 강좌 · 시간 미확인 ${response.unknown.length}개 (별도)</p>`+response.courses.map(id=>{const c=find(id);return `<div class="replacement-row">${e(rowName(c))} · ${c.credits}학점 · ${e(c.timeRaw||'시간 미지정 · 실제 일정 확인 필요')} · ${e({major:'전공',general:'교양',other:'타전공·기타',unknown:'분류 미확인'}[kind||courseKind(c)])}<button class="primary" data-direct-replacement="${e(id)}">교체</button><button class="secondary" data-preview-replacement="${e(id)}">배치·학점 미리보기</button></div>`;}).join('')+`<details><summary>시간 미확인 강좌 (배치 가능으로 확인하지 않음)</summary>${response.unknown.map(id=>`<p>${e(rowName(find(id)))}</p>`).join('')}</details>`;
    }catch(error){if(replacement===context)$('replacement-status').textContent='검색 실패: '+error.message;}finally{$('search-replacements').disabled=false;}
  }
  async function previewReplacement(id){
    const context=replacement;const ids=[...replacement.remaining,id];const previewConditions=clone(replacement.conditions);const choice=$('replace-kind').value;if(['major','general'].includes(choice))previewConditions.creditCategories={...previewConditions.creditCategories,[subject(find(id))]:choice};const old=find(replacement.removeId);if(old)previewConditions.required=previewConditions.required.filter(r=>r.subject!==subject(old));const info=await api('/api/inspect',{ids,conditions:previewConditions});
    const hard=await api('/api/inspect',{ids,conditions:previewConditions,checkTargets:false});
    if(replacement!==context)return;preview={id,ids,info,conditions:previewConditions};$('apply-replacement').disabled=!hard.valid;
    const before=await api('/api/inspect',{ids:replacement.ids,conditions:replacement.conditions,checkTargets:false});
    $('replacement-preview').innerHTML=`<h3>적용 전 미리보기</h3><p>${e(rowName(find(id)))} · ${e(find(id).timeRaw||'확인된 비동기')}</p><p>${['total','major','general','other'].map((k,i)=>`${['총','전공','교양','타전공·기타'][i]} ${before.credits[k]} → ${info.credits[k]}`).join(' / ')}</p><p>등교 ${before.days} → ${info.days}일 / 빈 시간 ${before.gaps} → ${info.gaps}${info.gapUnit}</p><p>${info.issues.map(e).join('<br>')||'설정 조건 충족'}</p><ul>${ids.map(oid=>`<li>${e(rowName(find(oid)))} — ${e(find(oid).timeRaw||'비동기 확인')}</li>`).join('')}</ul><p class="hint">학점 미달·초과는 초안으로 적용할 수 있습니다. 시간 충돌·점심·제외 등의 필수조건 위반은 적용하지 않습니다.</p>`;
  }

  $('lunch-weekdays').onclick=()=>{for(const x of document.querySelectorAll('#lunch-days input'))x.checked='월화수목금'.includes(x.value);};
  $('settings-clock').onclick=guard(()=>{collectSettings();settings.close();$('open-advanced').click();});
  $('open-constraints').onclick=()=>{renderSettings();settings.showModal();};
  $('reset-constraints').onclick=guard(async()=>{resetDialogConditions(active());renderSettings();await changed();message('조건 설정을 초기화했습니다. 기존 시간표는 유지됩니다. 자동 채우기를 다시 실행하세요.');});
  $('close-constraints').onclick=guard(async()=>{const before=JSON.stringify(active().conditions);collectSettings();if(before!==JSON.stringify(active().conditions))await changed();else persist();settings.close();});
  $('confirm-async').onclick=guard(async()=>{const id=$('async-course').value,evidence=$('async-evidence').value.trim();if(!evidence)throw Error('비동기 확인 근거를 입력해주세요.');active().conditions.asyncConfirmed[id]={evidence};persist();renderSettings();await inspect();});
  for(const id of ['exclude-internet','tracks','auto-areas','credit-mode','grade','free-days','free-days-hard','excluded',...['total','major','general','other'].flatMap(k=>['target','min','max'].map(f=>`target-${k}-${f}`))])$(id).addEventListener('change',guard(async()=>{collect();renderForm();await changed();await refresh();}));
  for(const id of ['area-top','list-profs','list-credits'])$(id).onchange=guard(refresh);
  $('list-credits').addEventListener('input',guard(refresh));
  $('reset-detail-search').onclick=guard(async()=>{$('area-top').value='';$('list-credits').value='';for(const o of $('list-profs').options)o.selected=false;await refresh();});
  document.addEventListener('click',guard(async event=>{const action=event.target.dataset.relax;if(!action)return;if(action==='freeDays')active().conditions.freeDaysHard=false;else if(action==='lunch'){active().conditions.lunch.enabled=false;active().conditions.lunch.prefer=true;}else return;renderForm();renderSettings();await changed();await run();}));
  $('auto-generate').onclick=guard(()=>run());$('section-generate').onclick=guard(()=>run({sections:true}));$('scenario-generate').onclick=guard(()=>run({scenario:true}));$('refill-plan').onclick=guard(()=>run({refill:true}));
  $('save-plan').onclick=guard(async()=>{await api('/api/draft',{ids:active().ids,conditions:cond()});collect();persist();message(`${state.active}안의 조건·수강이력·수정 초안을 저장했습니다. 새로고침 후에도 유지됩니다.`);});
  $('plan-select').onchange=guard(async()=>{const name=$('plan-select').value;try{await api('/api/draft',{ids:state.plans[name].ids,conditions:state.plans[name].conditions});}catch(error){$('plan-select').value=state.active;throw error;}state.active=name;revision++;renderForm();persist();await inspect();await compare();await refresh();});
  $('new-plan').onclick=guard(async()=>{const name=`사본 ${Object.keys(state.plans).length}`;state.plans[name]=clone(active());state.active=name;renderForm();persist();await inspect();});
  $('undo-plan').onclick=guard(async()=>{const prev=active().undo.at(-1);if(prev)await api('/api/draft',{ids:prev.ids,conditions:prev.conditions});undo(active());renderForm();persist();await inspect();await compare();});
  $('find-open').onclick=guard(()=>openReplacement());$('cancel-replace').onclick=()=>{edit.close();replacement=null;preview=null;};
  $('search-replacements').onclick=guard(searchReplacements);
  async function commitReplacement(){
    if(!preview||state.active!==replacement.plan)return;
    const original=active(),snapshot=JSON.stringify(original);
    const hard=await api('/api/inspect',{ids:preview.ids,conditions:preview.conditions,checkTargets:false});if(!hard.valid)throw Error(hard.issues.join(' / '));
    await api('/api/draft',{ids:preview.ids,conditions:preview.conditions});
    if(active()!==original||JSON.stringify(original)!==snapshot)throw Error('시간표가 변경되었습니다. 교체 검색을 다시 실행해주세요.');
    const old=find(replacement.removeId);replaceDraftCourse(active(),old,find(preview.id));active().conditions.creditCategories={...preview.conditions.creditCategories};
    if(old&&old.code!==find(preview.id).code)active().conditions.sessionExcluded=[...new Set([...active().conditions.sessionExcluded,old.code])];
    const c=find(preview.id);message('교체했습니다. 새 강좌는 고정하지 않으며 다음 자동 채우기에서 변경될 수 있습니다.');
    edit.close();preview=null;replacement=null;renderForm();persist();await inspect();await compare();
  }
  $('apply-replacement').onclick=guard(commitReplacement);
  for(const id of ['replace-kind','replace-area','replace-credits','replace-query','replace-tracks','replace-professors','replace-preferred','replace-after','replace-before','replace-same-time'])$(id).addEventListener('change',guard(searchReplacements));
  document.addEventListener('change',guard(async event=>{
    const t=event.target;
    if(t.dataset.requiredMode!==undefined){active().conditions.required[Number(t.dataset.requiredMode)].mode=t.value;active().conditions.required[Number(t.dataset.requiredMode)].origin='user';await changed();}
    if(t.dataset.requiredId!==undefined){const r=active().conditions.required[Number(t.dataset.requiredId)],old=r.id;try{await api('/api/draft',{ids:active().ids.map(id=>id===old?t.value:id),conditions:cond()});}catch(error){t.value=old;throw error;}r.id=t.value;r.origin='user';active().ids=active().ids.map(id=>id===old?t.value:id);await changed();}
  }));
  document.addEventListener('click',guard(async event=>{
    const b=event.target.closest('button');if(!b)return;const d=b.dataset,p=active().conditions;
    if(d.unrequire!==undefined){p.required.splice(Number(d.unrequire),1);await changed();}
    if(d.release){p.sessionExcluded=p.sessionExcluded.filter(c=>c!==d.release);await changed();}
    if(d.historyAdd){state.completed=[...new Set([...state.completed,d.historyAdd])];await changed();message('이전 수강과목에 등록했습니다. 모든 분반을 자동 후보에서 제외합니다.');}
    if(d.historyRemove){state.completed=state.completed.filter(c=>c!==d.historyRemove);persist();renderSettings();await inspect();}
    if(d.excludeAdd){p.excludedCodes=[...new Set([...p.excludedCodes,d.excludeAdd])];await changed();message('과목을 자동 생성 후보에서 제외했습니다. 설정에서 해제할 수 있습니다.');}
    if(d.excludeRemove){p.excludedCodes=p.excludedCodes.filter(c=>c!==d.excludeRemove);persist();renderSettings();await inspect();}
    if(d.assumeAsync){const c=find(d.assumeAsync);if(c.timeStatus!=='unspecified'||c.slots.length)throw Error('명시된 수업시간은 가정으로 없앨 수 없습니다.');p.asyncConfirmed[c.id]={type:'user_assumption',createdAt:new Date().toISOString()};await changed();showDetails(c.id);}
    if(d.asyncRemove){delete p.asyncConfirmed[d.asyncRemove];persist();renderSettings();await inspect();renderCatalog();if($('details').open)showDetails(d.asyncRemove);}
    if(d.scenarioAdd){const c=find(d.scenarioAdd);if(p.required.some(r=>r.subject===subject(c)))throw Error('일반 고정/필수 지정을 먼저 해제한 뒤 성공 시 포함으로 지정해주세요.');p.scenarioIds=[...new Set([...p.scenarioIds,c.id])];renderScenario();persist();}
    if(d.scenarioRemove){p.scenarioIds=p.scenarioIds.filter(id=>id!==d.scenarioRemove);p.scenarioFixed=(p.scenarioFixed||[]).filter(r=>r.id!==d.scenarioRemove);renderScenario();persist();await inspect();}
    if(d.plannerResult!==undefined){const r=active().results[Number(d.plannerResult)];const checked=await api('/api/inspect',{ids:r.ids,conditions:cond()});if(!checked.valid)throw Error(checked.issues.join(' / '));await api('/api/draft',{ids:r.ids,conditions:cond()});checkpoint(active());active().ids=[...r.ids];active().autoIds=[...r.autoIds];persist();await inspect();$('result-status').textContent=r.recommendation+` · 목표 대비 총학점 ${r.targetDifference.total>=0?'+':''}${r.targetDifference.total}`;await compare();}
    if(d.openPlan){await api('/api/draft',{ids:state.plans[d.openPlan].ids,conditions:state.plans[d.openPlan].conditions});state.active=d.openPlan;renderForm();persist();await inspect();await compare();await refresh();}
    if(d.editRemove){removeCourse(active(),find(d.editRemove));renderForm();persist();await inspect();await compare();}
    if(d.editReplace){$('details').close();await openReplacement(d.editReplace);}
    if(d.previewReplacement)await previewReplacement(d.previewReplacement);
    if(d.directReplacement){b.disabled=true;try{await previewReplacement(d.directReplacement);await commitReplacement();}catch(error){$('replacement-status').textContent='교체 불가: '+error.message;}finally{b.disabled=false;}}
    if(d.copyCourse){const c=find(d.copyCourse);await navigator.clipboard.writeText(`${c.name} ${c.instructor}`);message('과목명과 교수명을 복사했습니다. 에브리타임에서 직접 확인할 수 있습니다.');}
  }));

  function dataChanged(){
    for(const pl of Object.values(state.plans)){pl.conditions.majorProfile??='it';pl.conditions.targets.other??={target:null,min:null,max:null};}
    if(active().legacyReplacementPinCandidates?.length)message('이전 교체로 고정됐을 가능성이 있는 강좌: '+active().legacyReplacementPinCandidates.map(id=>find(id)?.name||id).join(', ')+' · 고정 강좌 관리에서 의도하지 않은 지정을 해제해주세요. 과거 직접 지정과 구별할 수 없어 자동 삭제하지 않았습니다.');
    const selectedArea=$('membership').value;
    $('membership').innerHTML='<option value="">전체 영역</option>'+options(areas(),[selectedArea]);
    $('area-top').innerHTML='<option value="">전체</option>'+options([...new Set(areas().map(a=>a.split('(')[0]))]);
    $('list-profs').innerHTML=options(profs());
    if(state.fingerprint&&state.fingerprint!==data().fingerprint)message('자료가 갱신되었습니다. 저장한 초안과 조건을 유지하고 현재 자료로 다시 검사합니다.');
    renderForm();guard(async()=>{await inspect();try{await api('/api/draft',{ids:active().ids,conditions:cond()});}catch(error){message('저장된 초안의 무결성을 확인해주세요. 기존 기록은 보존했습니다. '+error.message);}})();
  }
  dataChanged();
  return {
    creditLabel:c=>({major:'전공',general:'교양',other:'타전공·기타',unknown:'미확인'}[courseKind(c)]),
    timeLabel:c=>c.timeStatus==='unspecified'?(active().conditions.asyncConfirmed[c.id]?'정해진 수업시간 없음 · '+(active().conditions.asyncConfirmed[c.id].type==='user_assumption'?'사용자 가정':'확인 기록 있음'):'강의시간 미등록 · 실제 일정 확인 필요'):c.timeRaw,
    detailActions:c=>`${c.curriculum?'<p class="hint">2026-2 교과과정: '+(c.curriculum.map(r=>e(r.major+' '+r.requirement+' · '+r.grade+'학년 · '+r.source+' ('+r.page+'페이지)')).join('<br>')||'해당 과목의 교과과정 근거 없음')+'</p>':''}<p class="hint">${c.timeStatus==='unspecified'?(active().conditions.asyncConfirmed[c.id]?'정해진 수업시간 없음 · '+(active().conditions.asyncConfirmed[c.id].type==='user_assumption'?'사용자 가정':'확인 기록 있음'):'강의시간 미등록 · 실제 일정 확인 필요'):'실시간 수업 · '+e(c.timeRaw)}</p><div class="detail-actions"><button class="secondary" data-history-add="${e(c.code)}">이전 수강 등록</button><button class="secondary" data-copy-course="${e(c.id)}">과목명 + 교수명 복사</button>${areaOf(c).includes(EXT)?`<button class="secondary" data-scenario-add="${e(c.id)}">성공 시 포함</button>`:''}<button class="secondary" data-add="${e(c.id)}" ${active().conditions.required.some(r=>r.subject===subject(c))?'disabled':''}>담기·분반 고정</button><button class="secondary" data-exclude-add="${e(c.code)}">과목 제외</button>${active().ids.includes(c.id)?`<button class="secondary" data-edit-replace="${e(c.id)}">교체</button>`:''}</div>`,
    has:key=>active().conditions.required.some(r=>r.subject===key),
    catalogFilters:()=>{const major=$('kind').value==='major';$('apply-list-tracks').hidden=!major;$('apply-list-tracks').textContent='목록의 '+listTracks().join(' · ')+'을 학점 기준으로 적용';$('area-top').disabled=major;$('membership').disabled=major;$ ('major-browser').hidden=!major;$('major-track').disabled=['ict','it'].includes($('major-family').value);return {excludeInternet:!!active().conditions.excludeInternet,major_profile:active().conditions.majorProfile,term:active().conditions.term,search_group:major?listGroup():'',tracks:[],area_top:major?'':$('area-top').value,area:major?'':$('membership').value,professors:values('list-profs'),credits:$('list-credits').value};},
    requirementsFor:c=>c.curriculum?[...new Set(c.curriculum.filter(r=>r.major.toLowerCase()===active().conditions.majorProfile).map(r=>r.requirement))]:[...new Set(c.observations.map(o=>o.requirement))],
    extraActions:c=>`<button class="text-button" data-copy-course="${e(c.id)}">과목명 + 교수명 복사</button><button class="text-button" data-history-add="${e(c.code)}">${state.completed.includes(c.code)?'이전 수강 등록됨':'이전 수강'}</button><button class="text-button" data-exclude-add="${e(c.code)}">과목 제외</button>${areaOf(c).includes(EXT)?`<button class="text-button" data-scenario-add="${e(c.id)}">성공 시 포함</button>`:''}`,
    add:guard(async c=>{
      const pl=active(),snapshot=JSON.stringify(pl),p=clone(pl.conditions);
      if(p.scenarioIds.some(id=>subject(find(id))===subject(c)))throw Error('성공 시 포함 강좌는 일반 고정과 중복 지정할 수 없습니다.');
      const already=pl.ids.includes(c.id);
      const checked=await api('/api/draft',{ids:already?[...pl.ids]:[...pl.ids,c.id],conditions:cond()});
      if(active()!==pl||JSON.stringify(pl)!==snapshot)throw Error('시간표가 변경되었습니다. 담기를 다시 눌러주세요.');
      checkpoint(pl);
      if(already){pinDraftCourse(pl,c);await changed();$('details').close();message(`${c.name}을 고정했습니다. 다음 자동 채우기의 모든 후보에서 유지됩니다.`);await refresh();return;}
      p.required.push({subject:subject(c),mode:'fixed',id:c.id,origin:'user'});
      if(['major','general'].includes($('kind').value)&&c.app_credit_categories?.includes($('kind').value))p.creditCategories={...p.creditCategories,[subject(c)]:$('kind').value};
      pl.conditions=p;pl.ids=checked.ids;await changed();message(`${c.name} 강좌를 담았습니다.`);
    }),
    dataChanged
  };
}
