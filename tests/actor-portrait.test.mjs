import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {savePortrait, viewPortrait, bindPortraitControls, editPortrait} from "../src/sheets/portrait.mjs";

test("portrait save persists only the native picker image, never pending statistics or narrative edits",async()=>{
  const writes=[];globalThis.game={user:{id:"owner"}};
  const actor={id:"actor",img:"icons/svg/mystery-man.svg",testUserPermission:()=>true,update:async(data)=>{writes.push(data);return data}};
  const app={actor,isEditable:true,element:{querySelector:(selector)=>{assert.equal(selector,'[data-portrait-image][data-edit="img"]');return {getAttribute:()=>"systems/heroes-of-legend/assets/icons/mask.svg"}}}};
  await savePortrait.call(app);
  assert.deepEqual(writes,[{img:"systems/heroes-of-legend/assets/icons/mask.svg"}]);
  actor.img="systems/heroes-of-legend/assets/icons/mask.svg";await savePortrait.call(app);assert.equal(writes.length,1);
});
test("portrait mutation rejects observers and locked sheets before reading a chosen path",async()=>{
  globalThis.game={user:{id:"reader"}};
  const app={isEditable:true,actor:{testUserPermission:()=>false},element:{querySelector(){throw new Error("must not read image")}}};
  await assert.rejects(savePortrait.call(app),/owner/);
  app.actor.testUserPermission=()=>true;app.isEditable=false;
  await assert.rejects(savePortrait.call(app),/owner/);
});
test("portrait viewer checks read permission and uses the native Actor image viewer",()=>{
  globalThis.game={user:{id:"reader"}};let shown;
  globalThis.foundry={applications:{apps:{ImagePopout:class{constructor(options){shown=options}render(){return this}}}}};
  const actor={img:"portrait.webp",uuid:"Actor.hero",name:"Hero",testUserPermission:()=>true};
  viewPortrait.call({actor});assert.equal(shown.src,"portrait.webp");assert.equal(shown.uuid,"Actor.hero");
  actor.testUserPermission=()=>false;assert.throws(()=>viewPortrait.call({actor}),/cannot view/);
});
test("native IMG image editing and viewing support Enter and Space without duplicate handlers",()=>{
  let listener,clicks=0,prevented=0,bindings=0;
  const image={dataset:{},addEventListener:(event,fn)=>{assert.equal(event,"keydown");bindings++;listener=fn},click:()=>clicks++};
  const app={element:{querySelectorAll:()=>[image]}};bindPortraitControls(app);bindPortraitControls(app);
  for(const key of ["Enter"," ","Escape"])listener({key,preventDefault:()=>prevented++});
  assert.equal(bindings,1);assert.equal(clicks,2);assert.equal(prevented,2);
});
test("actor portrait templates keep native editing owner-only with immediate selection persistence",async()=>{
  for(const kind of ["character","creature"]){
    const template=await readFile(new URL(`../static/templates/${kind}.hbs`,import.meta.url),"utf8");
    assert(template.includes('{{#if editable}}data-action="editImage" data-edit="img"'),kind);
    assert(!template.includes('data-action="savePortrait"'),kind);
    assert(template.includes('data-portrait-image'),kind);
    assert(template.includes('data-action="viewPortrait"'),kind);
    assert(!template.includes('name="img"'),"No ad hoc path field");
  }
});


test("standard native FilePicker selection saves the portrait immediately while unrelated edits remain untouched",async()=>{
  const writes=[],errors=[];globalThis.game={user:{id:"owner"}};globalThis.ui={notifications:{error:message=>errors.push(message)}};
  const actor={id:"actor",uuid:"Actor.actor",img:"before.webp",testUserPermission:()=>true,update:async data=>{writes.push(data);actor.img=data.img;}};
  let options;globalThis.CONFIG={ux:{FilePicker:class{constructor(value){options=value;}async browse(){await options.callback("selected.webp");return this;}}}};
  await editPortrait.call({actor,isEditable:true});
  assert.equal(options.type,"image");assert.equal(options.current,"before.webp");assert.equal(options.document,actor);
  assert.deepEqual(writes,[{img:"selected.webp"}]);assert.equal(actor.img,"selected.webp");assert.deepEqual(errors,[]);
  actor.testUserPermission=()=>false;await assert.rejects(editPortrait.call({actor,isEditable:true}),/owner/);
});
