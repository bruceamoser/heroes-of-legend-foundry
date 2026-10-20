import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  buildContentPackArtifacts,
  readContentPackCatalogs,
  verifyAuthoredContentPacks,
} from "../scripts/content/content-packs.mjs";
import { validateSummonCatalogBasis } from "../scripts/content/summon-packs.mjs";
import { stableFoundryId } from "../scripts/content/item-packs.mjs";
import { renderMarkdown } from "../src/sheets/creature-reference.mjs";
const root = new URL("../", import.meta.url);
const catalogs = await readContentPackCatalogs(root);
const artifacts = buildContentPackArtifacts(catalogs);
const records = new Map(catalogs.summons.records.map((r) => [r.id, r]));

test("all 73 summon Actors retain exact source identities, printed statistics and attacker outcomes", async () => {
  const variants = new Set();
  assert.equal(artifacts.documents.summons.length, 73);
  assert.equal(artifacts.files.size, 729);
  for (const actor of artifacts.documents.summons) {
    const flags = actor.flags["heroes-of-legend"];
    const r = records.get(flags.catalogId),
      s = actor.system;
    assert.equal(actor._id, stableFoundryId(r.id));
    assert.equal(actor._id, r.foundryId);
    assert.equal(actor._key, `!actors!${r.foundryId}`);
    assert.equal(actor.type, "summon");
    assert.equal(flags.source.sha256, r.source.sha256);
    assert.equal(flags.sourceCommit, catalogs.lock.commit);
    assert.deepEqual(flags.references, r.references);
    assert.equal(flags.automation, "pending");
    assert.equal(flags.controllerId, undefined);
    assert.equal(s.health.baseMax, r.hp.maximum);
    assert.equal(s.health.value, r.hp.maximum);
    assert.deepEqual(
      Object.fromEntries(
        Object.entries(s.attributes).map(([k, v]) => [k, v.base]),
      ),
      r.attributes,
    );
    assert.equal(s.speed, r.speed.ordinary.value);
    assert.equal(s.speedSource, r.speed.sourceText);
    assert.deepEqual(
      s.alternateSpeeds,
      r.speed.alternates.map(({ mode, value }) => ({ mode, value })),
    );
    assert.deepEqual(s.footprint, {
      width: r.footprint.width,
      height: r.footprint.height,
    });
    assert.equal(actor.prototypeToken.width, r.footprint.width);
    assert.equal(actor.prototypeToken.height, r.footprint.height);
    assert.equal(actor.prototypeToken.actorLink, false);
    assert.deepEqual(s.defenseModifier, r.defenseModifier);
    assert.equal(s.stability, r.stability.value);
    assert.equal(s.stabilitySource, r.stability.sourceText);
    assert.equal(s.resistances.sourceText, r.mitigation.resistances.sourceText);
    assert.equal(s.weaknesses.sourceText, r.mitigation.weakness.sourceText);
    assert.deepEqual(s.immunities, r.mitigation.conditionImmunities);
    assert.equal(s.eligibility, r.eligibility);
    assert.equal(s.basicMelee.orientation, "attacker");
    const outcome = ["weak", "standard", "strong"].map((t) => s.basicMelee[t]);
    assert.deepEqual(
      outcome,
      ["weak", "standard", "strong"].map(
        (t) => r.basicMelee.outcomes[t].damage.amount,
      ),
    );
    variants.add(outcome.join("/"));
    assert.deepEqual(
      s.attacks.map((a) => [a.name, a.attribute, a.weak, a.standard, a.strong]),
      r.attacks.actions.map((a) => [
        a.name,
        a.attribute,
        a.outcomes.weak,
        a.outcomes.standard,
        a.outcomes.strong,
      ]),
    );
    assert.equal(s.sourceMarkdown, r.reference.sourceMarkdown);
    assert(
      s.referenceMarkdown.includes(
        `/blob/${catalogs.lock.commit}/${r.source.path}`,
      ),
    );
    assert.equal(s.restrictions.canReceiveHealing, false);
    assert.equal(s.restrictions.reactions, false);
    assert.equal(s.restrictions.opportunityAttacks, false);
    assert.equal(s.restrictions.independentTurns, false);
    assert.equal(s.restrictions.turnAnchor, "controller");
    assert.equal(s.restrictions.tetherSquares, 6);
    assert.deepEqual(actor.items, []);
    assert.deepEqual(actor.effects, []);
    assert.equal(s.basicMelee.defenseAttribute, undefined);
  }
  assert.deepEqual([...variants].sort(), ["1/1/2", "1/2/4", "2/3/5"]);
  await verifyAuthoredContentPacks(root, artifacts);
});

test("summon catalog fields cannot drift away from hash-verified locked source", () => {
  for (const mutate of [
    (r) => (r.basicMelee.outcomes.weak.damage.amount = 99),
    (r) => (r.attributes.brawn = 2),
    (r) => (r.footprint.width = 9),
    (r) => (r.command.limits.reactions = true),
    (r) => (r.reference.sourceMarkdown += "\n<script>bad()</script>"),
    (r) => (r.source.sha256 = "0".repeat(64)),
    (r) => (r.actionOrientation = "player-defense"),
  ]) {
    const catalog = structuredClone(catalogs.summons);
    mutate(catalog.records[0]);
    assert.throws(() =>
      validateSummonCatalogBasis({ catalog, lock: catalogs.lock }),
    );
  }
});

test("summon source rendering escapes arbitrary HTML and enriches only pinned book links", () => {
  const html = renderMarkdown(
    "# Profile\n\n<script>alert(1)</script> @UUID[Actor.secret]\n\n[bad](javascript:alert(1))\n\n[book](https://github.com/bruceamoser/heroes-of-legend/blob/" +
      catalogs.lock.commit +
      "/design/rules/summoning.md)",
  );
  assert(html.includes("&lt;script&gt;alert(1)&lt;/script&gt;"));
  assert(!html.includes("<script>"));
  assert(!html.includes('href="javascript:'));
  assert(html.includes("<h1>Profile</h1>"));
  assert(html.includes('rel="noopener noreferrer"'));
});

test("summon sheet offers source references without character or lifecycle controls", async () => {
  const template = await readFile(
    new URL("../static/templates/summon.hbs", import.meta.url),
    "utf8",
  );
  const sheet = await readFile(
    new URL("../src/sheets/summon.mjs", import.meta.url),
    "utf8",
  );
  assert(!/<input|<textarea|<select/.test(template));
  assert.deepEqual(
    [...template.matchAll(/data-action="([^"]+)"/g)].map((m) => m[1]),
    ["editImage", "viewPortrait", "viewPortrait", "updateProfile"],
  );
  assert(!sheet.includes("extends CharacterSheet"));
  assert(!sheet.includes("CreatureSheet"));
  assert(sheet.includes("links: false"));
  assert(template.includes("attacker outcomes"));
  assert(template.includes("Commands and lifecycle managed by the DA"));
  assert(template.includes("attacker outcomes"));
  assert(!template.includes('data-action="rollAttribute"'));
  assert(!template.includes("summon chains"));
  assert(template.includes('<details class="hol-creature-reference"'));
  assert(template.includes('data-card-section="commands"'));
});
