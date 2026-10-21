import test from 'node:test';
import assert from 'node:assert/strict';
import {linkCharacterTokens} from '../src/services/character-token-links.mjs';

function fixture({fail=false}={}) {
 const data={_id:'hero',name:'Hero',system:{biography:'Original'},items:[{_id:'sword',name:'Sword'}],effects:[],flags:{}},events=[];
 const actor={id:'hero',type:'character',prototypeToken:{actorLink:false},toObject:()=>structuredClone(data),getFlag:(_,key)=>data.flags['heroes-of-legend']?.[key],async setFlag(_,key,value){data.flags['heroes-of-legend']??={};data.flags['heroes-of-legend'][key]=structuredClone(value);events.push('backup');},async update(update){events.push('copy');if(fail)throw Error('Write rejected');Object.assign(data,structuredClone(update));this.prototypeToken.actorLink=true;this.afterUpdate?.();}};
 const token={actorId:'hero',actorLink:false,uuid:'Scene.scene.Token.hero',name:'Hero',parent:{name:'Scene'},delta:{toObject:()=>({system:{biography:'Token story'}}),apply:()=>({toObject:()=>({...structuredClone(data),system:{biography:'Token story'}})})},async update(){assert.equal(data.system.biography,'Token story');events.push('link');this.actorLink=true;}};
 const creature={id:'npc',type:'creature',prototypeToken:{actorLink:false},update(){throw Error('Creature should not change');}};
 const npc={actorId:'npc',actorLink:false};
 globalThis.game={user:{isGM:true},users:{activeGM:{isSelf:true}},actors:[actor,creature],scenes:{contents:[{tokens:{contents:[token,npc]}}]}};
 return{actor,token,npc,data,events};
}
test('legacy linking saves original actor/delta before copying and never converts creatures',async()=>{
 const f=fixture();assert.deepEqual(await linkCharacterTokens(),{linked:1});assert.deepEqual(f.events,['backup','copy','link']);assert.equal(f.npc.actorLink,false);assert.equal(f.data.flags['heroes-of-legend'].tokenLinkRecovery.actor.system.biography,'Original');assert.equal(f.data.flags['heroes-of-legend'].tokenLinkRecovery.tokens[0].delta.system.biography,'Token story');assert.deepEqual(await linkCharacterTokens(),{linked:0});
});
test('rejected character write leaves its token unlinked and recovery data intact',async()=>{
 const f=fixture({fail:true});await assert.rejects(linkCharacterTokens(),/Write rejected/);assert.equal(f.token.actorLink,false);assert.deepEqual(f.events,['backup','copy']);assert.equal(f.data.system.biography,'Original');assert.equal(f.data.flags['heroes-of-legend'].tokenLinkRecovery.tokens.length,1);
});
test('only active GM performs world conversion',async()=>{
 const f=fixture();game.user.isGM=false;assert.deepEqual(await linkCharacterTokens(),{linked:0});game.user.isGM=true;game.users.activeGM.isSelf=false;assert.deepEqual(await linkCharacterTokens(),{linked:0});assert.deepEqual(f.events,[]);
});

test('a token edit arriving during conversion is retained and prevents premature linking',async()=>{
 const f=fixture();let story='Token story';f.token.delta.toObject=()=>({system:{biography:story}});f.actor.afterUpdate=()=>{story='A later token edit';};await assert.rejects(linkCharacterTokens(),/token changed during recovery/);assert.equal(f.token.actorLink,false);assert.equal(f.data.flags['heroes-of-legend'].tokenLinkRecovery.tokens.length,2);assert.equal(f.data.flags['heroes-of-legend'].tokenLinkRecovery.tokens[1].delta.system.biography,'A later token edit');
});

test('a newer world Actor edit is never replaced by the older migration plan',async()=>{
 const f=fixture(),save=f.actor.setFlag.bind(f.actor);f.actor.setFlag=async(...args)=>{await save(...args);f.data.system.biography='A newer world edit';};await assert.rejects(linkCharacterTokens(),/latest Actor edits are preserved/);assert.equal(f.data.system.biography,'A newer world edit');assert.equal(f.token.actorLink,false);assert.deepEqual(f.events,['backup']);
});
