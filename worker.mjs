import {validateDraft,catalog,plan,inspectSchedule,replacements,scenarios} from './core.mjs?v=8d063b0d1d88b29c';
let courses=[];
self.onmessage=({data:{id,path,body}})=>{
 try {let result;
  switch(path){
   case 'init':courses=body;result=true;break;
   case '/api/search':result=catalog(courses,body);break;
   case '/api/plan':result=plan(courses,body);break;
   case '/api/scenarios':result=scenarios(courses,body);break;
   case '/api/draft':result=validateDraft(courses,body.ids,body.conditions);break;
   case '/api/inspect':result=inspectSchedule(courses,body.ids,body.conditions,body.checkTargets!==false);break;
   case '/api/replacements':result=replacements(courses,body.ids,body.removeId,body.conditions,body.filters);break;
   default:throw Error('지원하지 않는 웹앱 요청입니다.');
  }self.postMessage({id,result});
 }catch(error){self.postMessage({id,error:{message:error.message,kind:'input'}});}
};
