import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {CONDITION_KINDS} from '../src/rules/conditions.mjs';
import {DAMAGE_TYPES} from '../src/rules/damage.mjs';
async function fixture(input){let applied;const context=vm.createContext({canvas:{tokens:{controlled:[{}]}},foundry:{utils:{escapeHTML:value=>value},applications:{api:{DialogV2:{input:async()=>input}}}}});
 const modules={'../rules/conditions.mjs':{CONDITION_KINDS},'../rules/damage.mjs':{DAMAGE_TYPES},'../services/explicit-damage.mjs':{applySelectedDamage:async(components,options)=>{applied={components,options};}}};
 const m=new vm.SourceTextModule(await readFile(new URL('../src/dialogs/chat-damage.mjs',import.meta.url),'utf8'),{context});await m.link(spec=>{const values=modules[spec];return new vm.SyntheticModule(Object.keys(values),function(){for(const[k,v]of Object.entries(values))this.setExport(k,v);},{context});});await m.evaluate();
 return{prompt:m.namespace.promptChatDamage,get applied(){return applied;}};
}
const base={amount0:'0',amount1:'0',amount2:'0',type0:'physical',type1:'fire',type2:'cold',condition0:'',condition1:'',condition2:'',rating0:'1',rating1:'1',rating2:'1'};
test('manual outcome can explicitly apply condition-only without invented HP damage',async()=>{const f=await fixture({...base,condition0:'poisoned',rating0:'2'});await f.prompt({id:'result'},'Conditional printed effect');assert.equal(f.applied.components.length,0);assert.equal(f.applied.options.conditions[0].key,'poisoned');assert.equal(f.applied.options.conditions[0].rating,2);});
test('manual outcome preserves chosen typed damage and condition, rejecting impossible binary ratings',async()=>{const f=await fixture({...base,amount0:'3',type0:'fire',condition0:'burning',rating0:'2'});await f.prompt({id:'result'});assert.equal(f.applied.components[0].amount,3);assert.equal(f.applied.options.conditions[0].rating,2);const invalid=await fixture({...base,condition0:'prone',rating0:'3'});await assert.rejects(invalid.prompt({id:'result'}),/valid conditions/);assert.equal(invalid.applied,undefined);});
