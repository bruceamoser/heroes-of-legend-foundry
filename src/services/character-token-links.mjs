import {mergeCharacterTokenCopies,characterTokenBaseFingerprint} from '../rules/character-token-merge.mjs';
const ID = "heroes-of-legend";
let pending;
export async function linkCharacterTokens() {
  if (!game.user.isGM || !game.users.activeGM?.isSelf) return {linked:0};
  if (pending) return pending;
  pending = migrate().finally(() => { pending = null; });
  return pending;
}
async function backup(actor,tokens){
 const existing=actor.getFlag(ID,'tokenLinkRecovery')??{version:1,actor:actor.toObject(),tokens:[]};
 const keys=new Set(existing.tokens.map(token=>JSON.stringify([token.uuid,token.delta])));
 const additions=tokens.map(token=>({uuid:token.uuid,scene:token.parent.name,name:token.name,delta:token.delta.toObject()})).filter(token=>!keys.has(JSON.stringify([token.uuid,token.delta])));
 if(additions.length)await actor.setFlag(ID,'tokenLinkRecovery',{...existing,tokens:[...existing.tokens,...additions]});
 return actor.getFlag(ID,'tokenLinkRecovery');
}
async function chooseConflict(actor,tokens){
 const esc=foundry.utils.escapeHTML;
 return foundry.applications.api.DialogV2.prompt({window:{title:`Recover ${actor.name}`},content:`<p>These scene copies contain different character edits. Choose which copy wins where they disagree. Other changes and all original copies are preserved.</p><label>Character version<select name="version">${tokens.map(token=>`<option value="${esc(token.uuid)}">${esc(token.parent.name)} · ${esc(token.name)}</option>`).join('')}</select></label>`,ok:{label:'Keep selected version',callback:(_event,_button,dialog)=>dialog.element.querySelector('[name=version]').value},rejectClose:false});
}
async function migrate() {
 let linked=0;
 for(const actor of game.actors){
  if(actor.type!=='character'||actor.pack)continue;
  const tokens=game.scenes.contents.flatMap(scene=>scene.tokens.contents).filter(token=>token.actorId===actor.id&&!token.actorLink).sort((a,b)=>a.uuid.localeCompare(b.uuid));
  if(tokens.length){
   const base=actor.toObject(),deltas=tokens.map(token=>JSON.stringify(token.delta.toObject())),copies=tokens.map(token=>({uuid:token.uuid,data:token.delta.apply().toObject()}));
   let plan=mergeCharacterTokenCopies(base,copies);
   await backup(actor,tokens);
   if(plan.conflicts.length){const preferred=await chooseConflict(actor,tokens);if(!preferred){await actor.update({'prototypeToken.actorLink':true});continue;}plan=mergeCharacterTokenCopies(base,copies,preferred);}
   if(tokens.some((token,index)=>JSON.stringify(token.delta.toObject())!==deltas[index])){await backup(actor,tokens);throw Error(`${actor.name}'s token changed during recovery. Its edits are preserved; reload to recover the latest version.`);}
   if(characterTokenBaseFingerprint(actor.toObject())!==characterTokenBaseFingerprint(base))throw Error(`${actor.name} changed during recovery. Its latest Actor edits are preserved; reload to review the token copies again.`);
   plan.data.flags??={};plan.data.flags[ID]??={};plan.data.flags[ID].tokenLinkRecovery=actor.getFlag(ID,'tokenLinkRecovery');
   await actor.update({...plan.data,'prototypeToken.actorLink':true},{diff:false,recursive:false});
   for(let index=0;index<tokens.length;index++){
    const token=tokens[index];
    if(JSON.stringify(token.delta.toObject())!==deltas[index]){await backup(actor,tokens);throw Error(`${actor.name}'s token changed during recovery. Its edits are preserved; reload to recover the latest version.`);}
    await token.update({actorLink:true});linked++;
   }
  }
  if(!actor.prototypeToken.actorLink)await actor.update({'prototypeToken.actorLink':true});
 }
 return {linked};
}
