import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { equipmentItemSource } from "../src/rules/item-construction.mjs";
const source = (await readFile(new URL("../web/crafting-attempt.mjs", import.meta.url), "utf8"))
  .replaceAll('"./rules/', `"${new URL("../src/rules/", import.meta.url).href}`);
const { localCraftingOutcome } = await import(`data:text/javascript,${encodeURIComponent(source)}`);

test("standalone crafting brews healing and tonic without invoking dice; provisions and smoke still roll", () => {
  for (const [abilityId, recipeId] of [["ability-bottled-morning","recipe-lesser-healing-bottle"],["ability-the-cleverest-mixture","recipe-clearing-tonic"]]) {
    const result = localCraftingOutcome({abilityId,recipe:{id:recipeId},attribute:1,die:()=>{throw Error("unexpected dice");}});
    assert.equal(result.automatic,true);
    assert.equal(result.steps,1);
    assert.deepEqual(result.faces,[]);
    let dice=0;
    const provisions=localCraftingOutcome({abilityId,recipe:{id:"recipe-travel-food"},attribute:1,die:()=>{dice++;return 4;}});
    assert.equal(dice,3);
    assert.equal(provisions.automatic,false);
  }
  let dice=0;
  localCraftingOutcome({abilityId:"ability-smoke-in-a-bottle",recipe:{id:"recipe-smoke-flask"},attribute:1,die:()=>{dice++;return 4;}});
  assert.equal(dice,3);
});

test("native derived gear keeps approved provenance and description without requiring a price", async () => {
  const inventory=JSON.parse(await readFile(new URL("../static/data/inventory.json",import.meta.url)));
  for(const record of inventory.equipment.filter(r=>r.grantOnly)) {
    const item=equipmentItemSource(record,{sourceCommit:inventory.sourceCommit,creationGrant:true});
    assert.equal(item.system.bulk,1);
    assert.equal(item.flags["heroes-of-legend"].source.path,record.source.path);
    assert.equal(item.flags["heroes-of-legend"].source.sha256,record.source.sha256);
    assert.ok(item.system.description.includes(record.description));
    assert.ok(!item.system.description.includes("Market price"));
    assert.ok(!item.system.description.includes("undefined"));
  }
});
