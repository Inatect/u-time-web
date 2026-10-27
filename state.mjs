export const STORAGE_KEY='u-web-planner-v1';
export const clone=value=>JSON.parse(JSON.stringify(value));
export function validateFillResponse(report,conditions,courses){
  if(report.mode==='sections')throw Error('분반 조합 응답이 반환되어 자동 채우기로 적용하지 않았습니다.');
  const byId=new Map(courses.map(c=>[c.id,c]));
  for(const r of report.results){
    const chosen=r.ids.map(id=>byId.get(id));
    const keys=chosen.map(c=>c&&`${c.year}-${c.semester}:${c.code}`);
    if(chosen.some(c=>!c)||new Set(keys).size!==keys.length)throw Error('반환 강좌가 없거나 과목이 중복됩니다.');
    const actual=chosen.reduce((sum,c)=>sum+c.credits,0);
    if(Math.abs(actual-r.credits.total)>0.001)throw Error('반환 강좌와 총학점이 일치하지 않습니다.');
    for(const [key,target] of Object.entries(conditions.targets)){
      if(target.target==null||target.target==='')continue;
      const lo=conditions.creditMode==='flexible'?(target.min??target.target):target.target;
      const hi=conditions.creditMode==='flexible'?(target.max??target.target):target.target;
      if(r.credits[key]<lo||r.credits[key]>hi)throw Error('목표학점 미충족 응답: 부분 시간표를 생성 성공으로 적용하지 않았습니다.');
    }
    for(const req of conditions.required){
      if(req.mode==='fixed'?!r.ids.includes(req.id):!keys.includes(req.subject))throw Error('반환 시간표에서 고정·필수 강좌가 누락되었습니다.');
    }
  }
}
export function defaults(){return {term:'2026-2',majorProfile:'it',excludeInternet:false,freeDaysHard:true,grade:'4',tracks:[],generalAreas:[],required:[],
  creditMode:'exact',targets:{other:{target:null,min:null,max:null},total:{target:18,min:17,max:18},major:{target:null,min:null,max:null},general:{target:null,min:null,max:null}},
  freeDays:[],excluded:[],excludedCodes:[],sessionExcluded:[],preferredProfessors:[],excludedProfessors:[],
  allowedProfessors:[],onlyProfessors:false,lunch:{enabled:false,prefer:true,days:['월','화','수','목','금'],start:'12:00',end:'13:00'},
  timeMapping:{source:'',periods:{}},asyncConfirmed:{},preferences:{earlyBefore:'',lateAfter:''},scenarioIds:[]};}
export function blankPlan(conditions=defaults()){return {conditions:clone(conditions),ids:[],autoIds:[],results:[],undo:[],report:null};}
export function initialState(legacy=null){
  const state={version:3,active:'Main',completed:[],plans:{Main:blankPlan()},fingerprint:''};
  if(legacy?.conditions&&legacy?.result){
    const old=legacy.conditions,p=state.plans.Main;
    p.conditions.required=(old.selected||[]).map(s=>({subject:s,mode:old.fixed?.[s]?'fixed':'subject',id:old.fixed?.[s]||''}));
    p.conditions.freeDays=old.freeDays||[];p.conditions.excluded=old.excluded||[];p.conditions.grade=old.grade||'4';
    p.ids=legacy.result.ids||[];state.fingerprint=legacy.fingerprint||'';
  }
  return state;
}
export function loadState(storage){
  const raw=storage.getItem(STORAGE_KEY);
  if(!raw)return initialState(JSON.parse(storage.getItem('ulsan-timetable-v2')||'null'));
  const value=JSON.parse(raw);
  if(value.version!==3||!value.plans?.[value.active]||!Array.isArray(value.completed))throw Error('저장 데이터 형식을 확인할 수 없습니다. 기존 저장값을 덮어쓰지 않았습니다.');
  for(const plan of Object.values(value.plans)){repairLegacyReplacementPins(plan);plan.conditions.majorProfile??='it';plan.conditions.targets.other??={target:null,min:null,max:null};}
  return value;
}
export function saveState(storage,state){
  const serialized=JSON.stringify(state), prior=storage.getItem(STORAGE_KEY);
  if(prior&&prior!==serialized)storage.setItem(STORAGE_KEY+'-backup',prior);
  storage.setItem(STORAGE_KEY,serialized);
}
export function checkpoint(plan){
  plan.undo.push(clone({ids:plan.ids,autoIds:plan.autoIds,conditions:plan.conditions}));
  if(plan.undo.length>20)plan.undo.shift();
}
export function removeCourse(plan,course){
  checkpoint(plan);plan.ids=plan.ids.filter(id=>id!==course.id);plan.autoIds=plan.autoIds.filter(id=>id!==course.id);
  plan.conditions.required=plan.conditions.required.filter(r=>r.subject!==`${course.year}-${course.semester}:${course.code}`);
  plan.conditions.sessionExcluded=[...new Set([...plan.conditions.sessionExcluded,course.code])];
  plan.results=[];
}
export function applyReplacement(plan,removeId,newId,subjectKey){
  checkpoint(plan);plan.ids=plan.ids.filter(id=>id!==removeId);if(!plan.ids.includes(newId))plan.ids.push(newId);
  plan.autoIds=plan.autoIds.filter(id=>id!==removeId&&id!==newId);
  if(subjectKey)plan.conditions.required=plan.conditions.required.filter(r=>r.subject!==subjectKey);
  plan.results=[];
}

export function generationRequired(plan,courses,refill=false){
  if(!refill)return clone(plan.conditions.required);
  return plan.ids.map(id=>{const c=courses.find(x=>x.id===id);if(!c)throw Error('현재 자료에 없는 강좌입니다.');
    return {subject:`${c.year}-${c.semester}:${c.code}`,mode:'fixed',id,origin:'refill_once'};});
}

export function replaceDraftCourse(plan,oldCourse,newCourse){
  applyReplacement(plan,oldCourse?.id,newCourse.id,oldCourse?`${oldCourse.year}-${oldCourse.semester}:${oldCourse.code}`:null);
  // Replacing is an edit, never a request to pin the new subject.
  plan.autoIds=[...new Set([...plan.autoIds,newCourse.id])];
}

export function repairLegacyReplacementPins(plan){
  const previous=plan.undo?.at(-1);if(!previous)return [];
  const added=plan.ids.filter(id=>!previous.ids.includes(id)),removed=previous.ids.filter(id=>!plan.ids.includes(id));
  if(added.length!==1||removed.length!==1)return [];
  const accidental=plan.conditions.required.filter(r=>!r.origin&&r.id===added[0]&&!previous.conditions.required.some(old=>old.subject===r.subject));
  // Automatic replacement also recorded the removed subject in sessionExcluded.
  if(!plan.conditions.sessionExcluded?.some(code=>!previous.conditions.sessionExcluded?.includes(code)))return [];
  // Old versions did not record origin. Delete + manual add can produce the same
  // snapshot as replacement, so never silently remove a potentially explicit pin.
  if(accidental.length)plan.legacyReplacementPinCandidates=accidental.map(r=>r.id);
  return accidental;
}
export function undo(plan){const previous=plan.undo.pop();if(previous)Object.assign(plan,previous);plan.results=[];return !!previous;}
