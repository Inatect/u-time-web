const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function candidateGallery(results,courses,required=[],selected=[]){
 if(!results.length)return '<div class="empty">아직 비교할 후보가 없습니다. 목표학점까지 자동 채우기를 실행하면 여러 주간 시간표가 여기에 표시됩니다.</div>';
 const by=new Map(courses.map(c=>[c.id,c])),fixed=required.filter(r=>r.mode==='fixed'),fixedIds=new Set(fixed.map(r=>r.id));
 return '<p class="hint">각 시간표를 비교한 뒤 선택하세요. 🔒는 직접 고정한 강좌입니다. 시간 미지정 강좌는 표 아래에 표시합니다.</p><div class="candidate-gallery">'+results.map((r,i)=>{
 const cs=r.ids.map(id=>by.get(id)).filter(Boolean),days=[...'월화수목금'];for(const day of '토일')if(cs.some(c=>c.slots.some(s=>s.day===day)))days.push(day);
 const tokens=[...new Set([...Array.from({length:9},(_,j)=>String(j+1)),...cs.flatMap(c=>c.slots.map(s=>String(s.period)+(s.part||'')))])].sort((a,b)=>parseInt(a)-parseInt(b)||a.localeCompare(b));
 const missing=fixed.some(f=>!r.ids.includes(f.id)),chosen=selected.length===r.ids.length&&selected.every(id=>r.ids.includes(id));
 const grid='<table class="candidate-week"><thead><tr><th>교시</th>'+days.map(d=>'<th>'+d+'</th>').join('')+'</tr></thead><tbody>'+tokens.map(t=>'<tr><th>'+t+'</th>'+days.map(d=>'<td>'+cs.filter(c=>c.slots.some(s=>s.day===d&&String(s.period)+(s.part||'')===t)).map(c=>'<span class="candidate-class '+(fixedIds.has(c.id)?'pinned':'')+'" title="'+esc(c.name+' '+c.section+'분반 · '+c.instructor)+'">'+(fixedIds.has(c.id)?'🔒 ':'')+esc(c.name)+'</span>').join('')+'</td>').join('')+'</tr>').join('')+'</tbody></table>';
 return '<article class="candidate-card'+(chosen?' chosen':'')+'"><h3>후보 '+(i+1)+(chosen?' · 현재 선택':'')+'</h3><p>총 '+r.credits.total+' · 전공 '+r.credits.major+' · 교양 '+r.credits.general+' / 등교 '+r.days+'일</p><p class="hint">시간 선호: 이른 수업 '+(r.earlyCount==null?'미설정':r.earlyCount+'개 / '+r.earlyMinutes+'분')+' · 늦은 수업 '+(r.lateCount==null?'미설정':r.lateCount+'개 / '+r.lateMinutes+'분')+'</p><div class="candidate-grid-scroll">'+grid+'</div><p class="hint">시간 미지정: '+(cs.filter(c=>!c.slots.length).map(c=>esc(c.name)).join(', ')||'없음')+'</p><button class="primary" data-planner-result="'+i+'" '+(missing?'disabled':'')+'>'+(missing?'고정 강좌 누락 · 선택 불가':'이 시간표 선택')+'</button></article>';
 }).join('')+'</div>';
}
