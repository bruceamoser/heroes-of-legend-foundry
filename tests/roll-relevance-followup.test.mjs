import test from 'node:test';
import assert from 'node:assert/strict';
import {rollReferenceApplies,reactionTrigger} from '../src/rules/ability-roll-relevance.mjs';
import {abilityRollConfiguration} from '../src/rules/ability-roll.mjs';
import {referencePickerOptions} from '../src/services/reference-play.mjs';
import {defaultWoundApplicability,describeWoundEffect} from '../src/rules/wound-contributions.mjs';
import {prepareRoll} from '../src/services/roll-preparation.mjs';
import {readFile} from 'node:fs/promises';
const item=(id,text,rollMode='none')=>({id,name:id,system:{activity:{rollMode},description:`<div class="hol-reference-rules"><p>${text}</p></div>`}});

test('roll picker includes initiating action and matching printed modifiers, omits unrelated actions and boilerplate',()=>{
 const own=item('own','3 physical damage.','attribute'),other=item('other','Gain 1 Boon to this attack.','attribute');
 const defense=item('defend','Gain 1 Boon to defense rolls.'),guile=item('party','Gain 1 Boon to Guile rolls made to entertain.');
 const unrelated=item('move','Move 2 squares.'),boilerplate=item('burst','Make one attack roll using the least favorable net Boons/Banes.');
 const options={mode:'attribute',attributeKey:'guile',initiatingItemId:'own'};
 assert(rollReferenceApplies(own,options));assert(rollReferenceApplies(guile,options));
 for(const i of [other,defense,unrelated,boilerplate])assert.equal(rollReferenceApplies(i,options),false,i.id);
 assert(rollReferenceApplies(defense,{mode:'defense',attributeKey:'agility'}));
 assert.equal(rollReferenceApplies(guile,{mode:'attribute',attributeKey:'brawn'}),false);
});

test('visible reference picker applies relevance while preserving initiating ability identity',()=>{
 const actor={uuid:'Actor.hero',testUserPermission:()=>true};actor.items=[item('main','Hit.','attribute'),item('bonus','Gain 1 Boon to Reason rolls.'),item('utility','Move 2 squares.')];actor.items.get=id=>actor.items.find(i=>i.id===id);
 for(const i of actor.items){Object.assign(i,{documentName:'Item',type:'ability',actor});}
 globalThis.game={user:{},scenes:{viewed:{tokens:[]}}};
 const rows=referencePickerOptions(actor,{abilityItemId:'main',referenceItemIds:['main']},{mode:'attribute',attributeKey:'reason',initiatingItemId:'main'});
 assert.deepEqual(rows.map(row=>row.id),['bonus','main']);assert(rows.find(row=>row.id==='main').selected);
});

test('reaction cards preserve authored trigger before effect and expose it in rolled snapshots',()=>{
 const record={reference:{rules:{details:[{label:'Action',value:'Reaction'},{label:'Attribute',value:'Agility'},{label:'Trigger',value:'An enemy leaves your reach.'}],body:[{text:'Strike once.'}]}}};
 assert.equal(reactionTrigger(record),'An enemy leaves your reach.');
 assert.equal(abilityRollConfiguration(item('reaction','Strike.'),record).trigger,'An enemy leaves your reach.');
 record.reference.rules.details.pop();record.reference.rules.details.push({label:'Target / range / shape',value:'Self, before a physical defense.'});assert.equal(reactionTrigger(record),'Self, before a physical defense.');
 record.reference.rules.details[0].value='Maneuver';assert.equal(reactionTrigger(record),'');
});

test('physical wound starts applied to physical rolls and affects real prepared dice; contextual choice can override',()=>{
 const modifier={id:'wound-roll-shoulder',effectId:'shoulder',woundEventId:'injury',woundId:'wound-physical-223',injury:'Arm: strained shoulder',kind:'rollModifier',context:'physical',polarity:'bane',amount:1,label:'Strained shoulder',printedContext:'physical activities',sourceIds:['shoulder']};
 const basis={mode:'attribute',attributeKey:'brawn',attribute:1,contributions:[],woundModifiers:[modifier],benefits:[]};
 const choice=defaultWoundApplicability(modifier,basis);assert.equal(choice,'applies');
 const plan=prepareRoll(basis,{woundApplicability:{shoulder:choice}});assert.equal(plan.banes,1);assert.equal(plan.count,4);assert.match(plan.formula,/kl3/);
 const waived=prepareRoll(basis,{woundApplicability:{shoulder:'does-not-apply'}});assert.equal(waived.count,3);
 assert.equal(defaultWoundApplicability(modifier,{mode:'attribute',attributeKey:'reason'}),'does-not-apply');
 assert.equal(describeWoundEffect(modifier),'1 Bane · physical activities');
 assert.equal(describeWoundEffect({...modifier,amount:2}),'2 Banes · physical activities');
});

test('ability disclosures start closed and wound modifiers are immediately visible',async()=>{
 const template=await readFile(new URL('../static/templates/attribute-roll.hbs',import.meta.url),'utf8');
 assert.doesNotMatch(template,/<details open class="hol-roll-abilities/);
 assert.match(template,/<details open class="hol-context-options hol-wound-adjustments">/);
});

test('wound details show full injury, concrete modifier and remedy from the saved entry',async()=>{
 const catalog=JSON.parse(await readFile(new URL('../static/data/wounds.json',import.meta.url),'utf8'));
 const wound={id:'wound-physical-223',injury:'Arm: strained shoulder',key:'223',effects:catalog.records.find(record=>record.id==='wound-physical-223').effects};
 globalThis.fetch=async()=>({ok:true,json:async()=>catalog});globalThis.game={user:{}};
 let shown;globalThis.foundry={utils:{escapeHTML:value=>String(value)},applications:{api:{DialogV2:{prompt:async options=>{shown=options;}}}}};
 const {openWoundDetails}=await import('../src/applications/wound-details.mjs');
 const actor={testUserPermission:()=>true,getFlag:(_id,key)=>key==='wounds'?{injury:wound}:{}};
 await openWoundDetails(actor,'injury');assert.equal(shown.window.title,'Arm: strained shoulder');assert.match(shown.content,/1 Bane · physical activities/);assert.match(shown.content,/Soft Tissue/);assert.match(shown.content,/RV 2/);assert.doesNotMatch(shown.content,/rollModifier/);
 await assert.rejects(openWoundDetails({...actor,testUserPermission:()=>false},'injury'),/cannot inspect/);
});
