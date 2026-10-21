import test from 'node:test';
import assert from 'node:assert/strict';
import {equipmentReferenceHtml} from '../src/rules/item-construction.mjs';
import {equipmentEditableDescription} from '../src/sheets/equipment-description.mjs';
test('equipment editor omits generated bookkeeping while preserving authored HTML',()=>{
 const generated='<section class="hol-item-reference"><p class="hol-automation-label"><strong>Automation:</strong> Market reference</p><p><strong>Market price:</strong> 18 coins.</p><p><strong>Normal supply die:</strong> d8.</p><p class="hol-reference-source"><strong>Source:</strong> <a href="example">source</a> at <code>old commit</code>.</p></section>';
 assert.equal(equipmentEditableDescription(generated),'');
 const custom='<p><strong>Excalibur</strong> is a blade of legend.</p>';
 assert.equal(equipmentEditableDescription(custom),custom);
 assert.equal(equipmentEditableDescription('A simple sword.'),'A simple sword.');
 const extended=generated.replace('</section>','<p>My inscription</p></section>');
 assert.equal(equipmentEditableDescription(extended),extended);
});

test('equipment editor recognizes the actual importer description from any pinned commit',()=>{
 const record={price:18,inventoryDie:8,specialOrder:false,source:{path:'design/cards/ordinary-ranged-weapon.md',sha256:'a'.repeat(64)}};
 for(const sourceCommit of ['b'.repeat(40),'c'.repeat(40)]){
  const generated=equipmentReferenceHtml(record,{sourceCommit});
  assert.equal(equipmentEditableDescription(generated),'');
  const withProse=generated.replace('</section>','<p>Carved with the old king’s name.</p></section>');
  assert.equal(equipmentEditableDescription(withProse),withProse);
 }
});
