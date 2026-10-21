import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,access} from 'node:fs/promises';
import {creationPreview,creationStepErrors} from '../src/rules/creation.mjs';
import {learningCardView} from '../src/applications/learning-market.mjs';
import {DEFAULT_LANGUAGES} from '../src/rules/languages.mjs';
const choices=JSON.parse(await readFile(new URL('../static/data/choices.json',import.meta.url))).records;
const inventory=JSON.parse(await readFile(new URL('../static/data/inventory.json',import.meta.url)));
const fixtures=JSON.parse(await readFile(new URL('./fixtures/reference-heroes.json',import.meta.url)));
test('early learning does not request later class, heroic or equipment choices; Review retains them',()=>{
 const draft=structuredClone(fixtures.characters[0].draft);
 delete draft.classId;draft.classDisciplines=[];delete draft.signatureId;
 const preview=creationPreview(draft,choices,inventory,[...DEFAULT_LANGUAGES,...fixtures.campaignLanguages]);
 assert(preview.errors.some(e=>e.code==='class'));
 assert(!creationStepErrors(preview,3).some(e=>e.code==='class'));
 assert(creationStepErrors(preview,4).some(e=>e.code==='class'));
 assert.deepEqual(creationStepErrors(preview,7),preview.errors);
 const staged={stages:[{abilities:['early']}],errors:[{code:'acquisition',id:'early'},{code:'acquisition',id:'heroic'},{code:'purchase',stage:1},{code:'shopping'},{code:'signature',level:3}]};
 assert.deepEqual(creationStepErrors(staged,3),[staged.errors[0]]);
 assert.deepEqual(creationStepErrors(staged,5),staged.errors.slice(0,3));
 assert.deepEqual(creationStepErrors(staged,7),staged.errors);
});
test('every learning card uses existing discipline art and retains hybrid ranks/action codes',async()=>{
 for(const record of choices.filter(record=>['ability','discipline'].includes(record.kind))){
  const view=learningCardView(record,choices);
  for(const mark of view.marks){await access(new URL('../static/'+mark.src.replace('systems/heroes-of-legend/',''),import.meta.url));assert(mark.name);}
  if(record.kind==='ability')assert.deepEqual(view.marks.map(({id,rank})=>({id,rank})),(record.requirements??[]).filter(r=>r.kind==='discipline').map(({id,rank})=>({id,rank})));
 }
 for(const [action,code] of [['Main Action','A'],['Maneuver','M'],['Reaction','R'],['Passive','P']])assert.equal(learningCardView({reference:{rules:{details:[{label:'Action',value:action}]}},requirements:[]},choices).actionCode,code);
});
