import test from "node:test";
import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import { catalogItemIcon, itemIconForData, itemDisplayIcon, hasGenericItemIcon, DEFAULT_ABILITY_ICON, DEFAULT_EQUIPMENT_ICON } from "../src/rules/item-icons.mjs";
import { abilityItemSource, equipmentItemSource, authoredItemDocument } from "../src/rules/item-construction.mjs";
import { refreshDefaultItemIcons } from "../src/services/item-icons.mjs";
const choices = JSON.parse(await readFile(new URL("../static/data/choices.json", import.meta.url)));
const inventory = JSON.parse(await readFile(new URL("../static/data/inventory.json", import.meta.url)));
const verifiedCore = new Set(JSON.parse(await readFile(new URL("../docs/foundry-core-illustrations.json", import.meta.url))).verifiedPaths);
const catalogs = { choices: choices.records, inventory };
test("every approved ability and equipment grant and authored pack has packaged non-bag art", async () => {
  const images = new Set();
  for (const record of choices.records.filter(r => r.kind === "ability")) {
    const item = abilityItemSource(record, { sourceCommit: choices.sourceCommit });
    assert.equal(item.img, catalogItemIcon(record));
    assert.notEqual(item.img, DEFAULT_ABILITY_ICON, `Approved ability needs a specific mark: ${record.id}`);
    assert.equal(authoredItemDocument(item, "1234567890abcdef").img, item.img);
    images.add(item.img);
  }
  for (const record of inventory.equipment) {
    const item = equipmentItemSource(record, { sourceCommit: choices.sourceCommit });
    assert.equal(item.img, catalogItemIcon(record));
    assert.equal(authoredItemDocument(item, "1234567890abcdef").img, item.img);
    images.add(item.img);
  }
  assert.ok(images.size > 30);
  for (const image of images) {
    if (image.startsWith("icons/")) {
      assert.match(image, /^icons\/[a-z-]+\/[a-z-]+\/[a-z-]+\.webp$/);
      assert(verifiedCore.has(image), image);
      if (process.env.HOL_CORE_ASSETS) await access(`${process.env.HOL_CORE_ASSETS}/${image}`);
    } else {
      assert.match(image, /^systems\/heroes-of-legend\/assets\/marks\/[a-z]+\.webp$/);
      await access(new URL(`../static/${image.replace("systems/heroes-of-legend/", "")}`, import.meta.url));
    }
  }
});
test("discipline marks, signature families and recognizable equipment/basic actions map predictably", () => {
  const life = choices.records.find(r => r.id === "ability-a-bough-for-the-fallen");
  assert.match(catalogItemIcon(life), /marks\/life\.webp$/);
  assert.match(catalogItemIcon({ id: "ability-signature-blade-cut-and-turn", kind: "ability" }), /marks\/arms\.webp$/);
  for (const id of ["item-ordinary-melee-weapon","item-lesser-healing-bottle","item-ordinary-shield","item-local-map"]) assert(verifiedCore.has(catalogItemIcon({id})));
  assert.match(catalogItemIcon({id:"ability-basic-ranged",kind:"ability"}), /shortbow-leather\.webp$/);
  assert.equal(catalogItemIcon({id:"ability-unknown",kind:"ability"}),DEFAULT_ABILITY_ICON);
  assert.equal(catalogItemIcon({id:"../../unsafe"}),DEFAULT_EQUIPMENT_ICON);
});
test("default recognition never replaces a custom image, even a bag with a user path", () => {
  for (const image of [undefined,null,"","icons/svg/item-bag.svg","icons/svg/item.svg"]) assert.equal(hasGenericItemIcon(image),true);
  for (const image of ["worlds/my-world/item-bag.svg","icons/custom-bag.webp","https://example.com/item.png"]) {
    assert.equal(hasGenericItemIcon(image),false);
    assert.equal(itemIconForData({type:"equipment",img:image,system:{catalogId:"item-water-flask"}},catalogs),null);
  }
});
test("cosmetic refresh touches only owned generic world/embedded items, only img", async () => {
  const writes=[];
  globalThis.game={user:{id:"owner"},i18n:{localize:key=>key}};
  const item = (id, img, { owner=true, pack=false }={}) => ({ id, uuid:`Item.${id}`, img, pack, testUserPermission:()=>owner, toObject:()=>({type:"equipment",img,system:{catalogId:"item-water-flask"}}), update:async data=>writes.push([id,data]) });
  const count=await refreshDefaultItemIcons([item("plain","icons/svg/item-bag.svg"),item("custom","worlds/custom.webp"),item("observer","icons/svg/item-bag.svg",{owner:false}),item("pack","icons/svg/item-bag.svg",{pack:true})],catalogs);
  assert.equal(count,1); assert.deepEqual(writes,[["plain",{img:catalogItemIcon({id:"item-water-flask"})}]]);
  delete globalThis.game;
});

test("native card artwork uses the Item image, with mapped fallback only for core defaults", () => {
  for (const type of ["equipment", "ability"]) {
    const item = { type, img: "worlds/campaign/my-chosen-art.webp", flags: { "heroes-of-legend": { catalogId: "ability-basic-ranged" } }, system: { catalogId: "item-water-flask" } };
    assert.equal(itemDisplayIcon(item, catalogs), item.img);
    item.img = "icons/svg/item-bag.svg";
    assert.match(itemDisplayIcon(item, catalogs), type === "equipment" ? /waterskin-leather-brown\.webp$/ : /shortbow-leather\.webp$/);
    item.img = "systems/heroes-of-legend/assets/icons/potion.svg";
    assert.equal(itemDisplayIcon(item, catalogs), item.img);
  }
});

test("migration recognizes only the exact previous default for a known catalog item", () => {
  const flask = {type:"equipment",system:{catalogId:"item-water-flask"},img:"systems/heroes-of-legend/assets/icons/flask.svg"};
  assert.equal(itemIconForData(flask,catalogs),catalogItemIcon({id:"item-water-flask"}));
  flask.img="systems/heroes-of-legend/assets/icons/potion.svg";
  assert.equal(itemIconForData(flask,catalogs),null);
  flask.system.catalogId="item-unknown"; flask.img="systems/heroes-of-legend/assets/icons/flask.svg";
  assert.equal(itemIconForData(flask,catalogs),null);
  const ability={type:"ability",flags:{"heroes-of-legend":{catalogId:"ability-basic-ranged"}},img:"systems/heroes-of-legend/assets/icons/bow.svg"};
  assert.match(itemIconForData(ability,catalogs),/shortbow-leather/);
});
