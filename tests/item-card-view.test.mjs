import {abilityRuleReferenceHTML} from "../src/rules/rule-reference-view.mjs";
import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {chromium} from "playwright";
import {itemCardContext,formatItemCard} from "../src/sheets/item-card-view.mjs";
const root=new URL("../",import.meta.url);
const choices=JSON.parse(await readFile(new URL("static/data/choices.json",root))).records;
const inventory=JSON.parse(await readFile(new URL("static/data/inventory.json",root)));
const catalogs={choices,inventory};
function item(type,record,system={}){return {id:"world-copy",type,system,getFlag:(_ns,key)=>key==="source"?record?.source:key==="itemNotes"?"Our table notes":undefined};}
test("native item metadata follows stable catalog source while live quantity/bulk/supply stay on the Item",()=>{
 const equipment=inventory.equipment.find(record=>record.inventoryDie>0);
 const document=item("equipment",equipment,{catalogId:equipment.id,bulk:5,quantity:0,inventoryDie:0});
 const view=itemCardContext(document,catalogs);
 assert.equal(view.cardPrice,equipment.price);assert.equal(view.cardSourcePath,equipment.source.path);
 assert.equal(view.cardHasSupply,true);assert.equal(view.itemNotes,"Our table notes");
 assert.equal(document.system.quantity,0);assert.equal(document.system.bulk,5);assert.equal(document.system.inventoryDie,0);
 const ability=choices.find(record=>record.kind==="ability"&&record.requirements.length>0);
 const card=itemCardContext(item("ability",ability),catalogs);
 const copy=item("ability",null);copy.getFlag=(_ns,key)=>key==="catalogId"?ability.id:undefined;
 assert.equal(itemCardContext(copy,catalogs).cardRecord.id,ability.id);
 assert.equal(card.cardLevel,ability.minimumLevel);assert.equal(card.cardCost,ability.cost);
 assert.equal(card.cardRequirements.length,ability.requirements.length);
 assert.ok(card.cardRequirements.every(row=>typeof row.name==="string"));
 const custom=itemCardContext(item("equipment",null,{inventoryDie:0}),catalogs);
 assert.equal(custom.cardPrice,"—");assert.equal(custom.cardHasSupply,false);
});
test("card presentation keeps complete flavor, metadata and outcome text while placing provenance below",async()=>{
 const browser=await chromium.launch({headless:true});
 try{
  const page=await browser.newPage();
  const html='<section><article data-item-rules><section class="hol-item-reference"><p class="hol-automation-label">Manual</p><div class="hol-reference-flavor"><p>Warm light blooms.</p></div><h2>Rules</h2><dl class="hol-reference-details"><div><dt>Action</dt><dd>Main Action</dd></div></dl><dl class="hol-reference-outcomes"><dt>Weak</dt><dd>Restore 3 HP.</dd><dt>Standard</dt><dd>Restore 6 HP.</dd><dt>Strong</dt><dd>Restore 9 HP.</dd></dl><p class="hol-reference-source">Pinned source</p></section></article><details><summary>Source</summary><div data-item-provenance></div></details></section>';
  await page.setContent(html);
  await page.evaluate(`(${formatItemCard.toString()})(document.querySelector('section'))`);
  assert.equal(await page.locator('.hol-item-outcome-table tr').count(),3);
  assert.deepEqual(await page.locator('.hol-item-outcome-table td').allTextContents(),['Restore 3 HP.','Restore 6 HP.','Restore 9 HP.']);
  assert.equal(await page.locator('[data-item-rules] .hol-reference-flavor').textContent(),'Warm light blooms.');
  assert.equal(await page.locator('[data-item-rules] .hol-reference-details dd').textContent(),'Main Action');
  assert.equal(await page.locator('[data-item-provenance] .hol-reference-source').textContent(),'Pinned source');
  assert.equal(await page.locator('[data-item-rules] h2').count(),0);
 }finally{await browser.close();}
});

test("inline ability rules use the complete approved structured reference and escape authored text",()=>{
 const record=choices.find(record=>record.id==="ability-a-bough-for-the-fallen");
 const html=abilityRuleReferenceHTML(record);
 for(const field of record.reference.rules.details)assert.ok(html.includes(field.value.replaceAll("&","&amp;")));
 for(const block of record.reference.rules.body)for(const outcome of block.outcomes??[])assert.ok(html.includes(outcome.text));
 assert.ok(html.includes(record.reference.flavor[0]));assert.ok(!html.includes("<strong>ID:"));
 const unsafe=abilityRuleReferenceHTML({name:"<script>",reference:{flavor:["<img onerror=bad>"],rules:{details:[],body:[],notes:[]}}});
 assert.ok(!unsafe.includes("<script>"));assert.ok(unsafe.includes("&lt;img"));
});
