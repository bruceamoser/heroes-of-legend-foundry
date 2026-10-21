const ID='heroes-of-legend';
const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
function normalize(source){
 const data=structuredClone({name:source.name,img:source.img,system:source.system??{},flags:source.flags??{},items:Object.fromEntries((source.items??[]).map(row=>[row._id,row])),effects:Object.fromEntries((source.effects??[]).map(row=>[row._id,row]))});
 if(data.flags[ID]){delete data.flags[ID].tokenLinkRecovery;if(!Object.keys(data.flags[ID]).length)delete data.flags[ID];}
 return data;
}
export const characterTokenBaseFingerprint=source=>JSON.stringify(normalize(source));
function differences(before,after,path=[]){
 if(same(before,after))return [];
 if(object(before)&&object(after))return [...new Set([...Object.keys(before),...Object.keys(after)])].flatMap(key=>{
  if(!Object.hasOwn(after,key))return [{path:[...path,key],remove:true}];
  if(!Object.hasOwn(before,key))return [{path:[...path,key],value:after[key]}];
  return differences(before[key],after[key],[...path,key]);
 });
 return [{path,value:after}];
}
const overlap=(a,b)=>a.slice(0,Math.min(a.length,b.length)).every((key,index)=>key===b[index]);
function apply(data,change){let parent=data;for(const key of change.path.slice(0,-1)){if(!object(parent[key]))parent[key]={};parent=parent[key];}const key=change.path.at(-1);if(change.remove)delete parent[key];else parent[key]=structuredClone(change.value);}
/** Merge only each copy's actual changes. Embedded documents compare by ID, not array position. */
export function mergeCharacterTokenCopies(base,copies,preferred=null){
 const original=normalize(base),changes=copies.map(copy=>({...copy,changes:differences(original,normalize(copy.data))})),conflicts=[];
 for(let i=0;i<changes.length;i++)for(let j=i+1;j<changes.length;j++)for(const a of changes[i].changes)for(const b of changes[j].changes)if(overlap(a.path,b.path)&&!(same(a.path,b.path)&&same(a.value,b.value)&&a.remove===b.remove))conflicts.push({left:changes[i].uuid,right:changes[j].uuid,path:(a.path.length<=b.path.length?a.path:b.path)});
 const result=structuredClone(original),ordered=[...changes.filter(copy=>copy.uuid!==preferred),...changes.filter(copy=>copy.uuid===preferred)];
 const conflictPaths=[...new Map(conflicts.map(conflict=>[JSON.stringify(conflict.path),conflict.path])).values()];
 for(const copy of ordered)for(const change of copy.changes)if(!preferred||!conflictPaths.some(path=>overlap(path,change.path)))apply(result,change);
 if(preferred){
  const chosen=normalize(copies.find(copy=>copy.uuid===preferred).data);
  for(const path of conflictPaths){let value=chosen,exists=true;for(const key of path){if(!object(value)||!Object.hasOwn(value,key)){exists=false;break;}value=value[key];}apply(result,exists?{path,value}:{path,remove:true});}
 }
 return {data:{...result,items:Object.values(result.items),effects:Object.values(result.effects)},conflicts};
}
