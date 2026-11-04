import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { chromium } from "playwright";
import { parseAbilityReference } from "../scripts/content/choices.mjs";
import { abilityReferenceHtml } from "../src/rules/item-construction.mjs";
import { abilityRuleReferenceHTML } from "../src/rules/rule-reference-view.mjs";
import { recordMarkup, ruleBlockMarkup } from "../web/rules-view.mjs";
const fixtures = JSON.parse(await readFile(new URL("./fixtures/decision-rule-rendering.json", import.meta.url)));
const visible = value => value.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1").replace(/[*`]/g, "").replace(/\s+/g, " ").trim();
const native = (reference, source) => abilityReferenceHtml(reference, { source, sourceCommit: fixtures.sourceCommit, automationLabel: "Manual" });

test("all 36 audited inline triads preserve complete authored prose instead of guessing tier scope", () => {
  const affected = fixtures.records.filter(row => row.inlineTriad);
  assert.equal(affected.length, 36);
  for (const row of affected) {
    const reference = parseAbilityReference(row.sourceMarkdown);
    const paragraphs = row.sourceMarkdown.split("## Rules")[1].split(/\n---\n/)[0].trim().split(/\n\s*\n/);
    const inline = paragraphs.filter(paragraph => /\bWeak\b/.test(paragraph) && /\bStandard\b/.test(paragraph) && /\bStrong\b/.test(paragraph) && !paragraph.startsWith("- "));
    assert(inline.length, row.name);
    for (const paragraph of inline) {
      assert(reference.rules.body.some(block => block.text === visible(paragraph) && !block.outcomes), row.name);
    }
  }
});

test("Triage's two healing profiles and Twin Strike damage retain their original value-to-tier association", () => {
  const rules = name => parseAbilityReference(fixtures.records.find(row => row.name === name).sourceMarkdown).rules.body.map(block => block.text ?? "").join(" ");
  assert.match(rules("Triage"), /6 HP on Weak, 11 HP on Standard, 16 HP on Strong/);
  assert.match(rules("Triage"), /4 HP each on Weak, 7 HP each on Standard, 10 HP each on Strong/);
  assert.match(rules("Twin Strike"), /1 physical damage on Weak, 2 on Standard, 3 on Strong/);
});

test("every audited rules paragraph and option survives the actual web/native HTML renderers", async () => {
  const browser = await chromium.launch({headless:true});
  try {
    const page = await browser.newPage();
    for (const row of fixtures.records) {
      const reference = parseAbilityReference(row.sourceMarkdown);
      const record = {name:row.name, reference};
      for (const [surface, html] of [["web", recordMarkup(record)], ["native Item", native(reference, row.source)], ["native reference", abilityRuleReferenceHTML(record)]]) {
        await page.setContent(html);
        const text = (await page.locator("body").innerText()).replace(/\s+/g, " ");
        for (const block of reference.rules.body) {
          for (const expected of [block.text, ...(block.items ?? []), ...(block.outcomes ?? []).map(outcome => outcome.text)].filter(Boolean))
            assert(text.includes(expected), `${row.name}: ${surface} lost ${expected}`);
        }
      }
    }
  } finally { await browser.close(); }
});

test("mixed blocks retain their preface, explicit outcomes and choices together and escape authored HTML", async () => {
  const block = {text:'Pay 2 HP. <script>bad()</script>', outcomes:[{label:"Weak",text:"Restore 3 HP."},{label:"Standard",text:"Restore 6 HP."},{label:"Strong",text:"Restore 9 HP."}], items:["Snap Back", "Manifest"]};
  const reference = {flavor:["Narrative"], rules:{details:[],body:[block],notes:[]}};
  const source = fixtures.records[0].source;
  for (const html of [ruleBlockMarkup(block), ruleBlockMarkup(block, {outcomeLayout:"stacked"}), native(reference, source), abilityRuleReferenceHTML({name:"Example",reference})]) {
    for (const expected of ['Pay 2 HP.', '&lt;script&gt;', 'Restore 3 HP.', 'Restore 6 HP.', 'Restore 9 HP.', 'Snap Back', 'Manifest']) assert(html.includes(expected), expected);
    assert(!html.includes('<script>'));
  }
});

test("explicit authored bullet outcome tables remain structured", () => {
  const row=fixtures.records[0];
  const markdown=row.sourceMarkdown.replace(/## Rules\n[\s\S]*?\n---\n/, '## Rules\n\n**Action:** Main Action · **Attribute:** Reason\n\n**Target / range / shape:** One ally.\n\n- **Weak:** Restore 3 HP.\n- **Standard:** Restore 6 HP.\n- **Strong:** Restore 9 HP.\n\n---\n');
  const reference=parseAbilityReference(markdown);
  assert.deepEqual(reference.rules.body,[{outcomes:[{label:"Weak",text:"Restore 3 HP."},{label:"Standard",text:"Restore 6 HP."},{label:"Strong",text:"Restore 9 HP."}]}]);
});
