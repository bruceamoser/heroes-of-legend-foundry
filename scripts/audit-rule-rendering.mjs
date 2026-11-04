import {readFile, readdir, mkdir, writeFile} from "node:fs/promises";
import {execFileSync} from "node:child_process";
import {createHash} from "node:crypto";
import {resolve, join} from "node:path";
import {pathToFileURL} from "node:url";
import {chromium} from "playwright";
import {recordMarkup, ruleBlockMarkup} from "../web/rules-view.mjs";
import {abilityRuleReferenceHTML} from "../src/rules/rule-reference-view.mjs";

// This extraction deliberately does not call the importer. The expected text
// comes from immutable authored Markdown, independently of the generated bodies.
export function visibleRules(markdown, kind) {
  const body=markdown.split(/\n## Rules\s*\n/)[1]?.split(/\n---\n/)[0];
  if (!body) throw Error("Missing authored Rules section");
  const paragraphs=body.trim().split(/\n\s*\n/).filter(Boolean);
  return paragraphs.filter(paragraph => !/^\*\*(?:Action|Attribute|Time|Target \/ range \/ shape|Duration|Equipment \/ acquisition|Ancestry|Choice|ID|Status|Tags):\*\*/.test(paragraph) && !/^\[Ancestry choices\]/.test(paragraph));
}
export function authoredDescription(markdown) {
  const match = markdown.match(/^# [^\n]+\n\n\*([^\n]+)\*\n\n## Rules\b/);
  if (!match) throw Error("Missing authored choice description");
  return match[1];
}
export function normalizedText(text) {
  return String(text).replace(/\[([^\]]+)\]\([^)]+\)/g,"$1").normalize("NFKC").toLowerCase().replace(/[^a-z0-9]/g,"");
}
export function missingAuthoredRules(expected, actual) {
  const text=normalizedText(actual);
  return expected.filter(paragraph => !text.includes(normalizedText(paragraph)));
}
const json=async path=>JSON.parse(await readFile(path,"utf8"));
const sha=bytes=>createHash("sha256").update(bytes).digest("hex");
export async function auditRuleRendering({root=resolve(new URL("../",import.meta.url).pathname),book=process.env.HOL_BOOK_REPOSITORY??"/home/bmoser/repos/heroes-of-legend",output=process.env.HOL_AUDIT_OUTPUT??"test-results/decision-audit/rule-rendering.json",lockPath=join(root,"content/source-lock.json"),catalogPath=join(root,"static/data/choices.json"),nativeDirectory=join(root,"content/packs/abilities"),renderers={recordMarkup,ruleBlockMarkup,abilityRuleReferenceHTML}}={}) {
  const lock=await json(lockPath);
  const catalog=await json(catalogPath);
  const profiles=await json(join(root,"scripts/content/inline-roll-profiles.json"));
  const common=await json(join(root,"tests/fixtures/reviewed-common-procedures.json"));
  const rows=catalog.records.filter(record=>["ability","trait"].includes(record.kind));
  const native=new Map();
  for(const file of await readdir(nativeDirectory))if(file.endsWith(".json")){
    const item=await json(join(nativeDirectory,file));native.set(item.flags?.["heroes-of-legend"]?.catalogId,item);
  }
  const report={scope:"Immutable authored choice descriptions and Rules → generated native Item descriptions and web/native renderer DOM. Separate from design approval and runtime effect acceptance.",bookCommit:lock.commit,checks:[],failures:[],records:[]};
  const check=(name,pass,details={})=>{const row={name,pass,...details};report.checks.push(row);if(!pass)report.failures.push(row);};
  check("catalog pin",catalog.sourceCommit===lock.commit);
  if(process.env.HOL_AUDIT_BOOK_COMMIT)check("requested book pin",lock.commit===process.env.HOL_AUDIT_BOOK_COMMIT);
  check("ability inventory",rows.filter(row=>row.kind==="ability").length===427);
  check("trait inventory",rows.filter(row=>row.kind==="trait").length===50);
  check("reviewed inline inventory",Object.keys(profiles).length===36);
  check("all reviewed profile identities exist",Object.keys(profiles).every(id=>rows.some(row=>row.id===id&&row.kind==="ability")));
  check("reviewed common scope inventory",common.length===21);
  const browser=await chromium.launch({headless:true});
  try {
    const page=await browser.newPage();
    for (const record of rows) {
      const bytes=execFileSync("git",["-C",book,"show",`${lock.commit}:${record.source.path}`],{maxBuffer:1024*1024});
      const source=bytes.toString();const locked=lock.records.find(row=>row.path===record.source.path);
      check(`source ${record.id}`,sha(bytes)===record.source.sha256&&locked?.sha256===record.source.sha256);
      const description=authoredDescription(source);
      check(`catalog description ${record.id}`,record.reference.flavor.length===1&&record.reference.flavor[0]===description);
      const expected=visibleRules(source,record.kind);
      check(`authored rule inventory ${record.id}`,expected.length>0);
      const item=native.get(record.id);
      const surfaces=[["web Item/rules",renderers.recordMarkup(record),"p.flavor"],["Workshop reference",record.reference.rules.body.map(block=>renderers.ruleBlockMarkup(block,{outcomeLayout:"stacked"})).join("")],["native reference",renderers.abilityRuleReferenceHTML(record),"p.hol-rule-flavor"]];
      if(record.kind==="ability"){
        check(`generated Item exists ${record.id}`,Boolean(item));
        check(`generated Item provenance ${record.id}`,item?.flags?.["heroes-of-legend"]?.source?.sha256===record.source.sha256);
        surfaces.push(["generated native Item",item?.system.description??"", ".hol-reference-flavor > p"]);
      }
      const evidence={id:record.id,name:record.name,source:record.source,paragraphs:expected.length,surfaces:[]};
      for(const [surface,html,descriptionSelector]of surfaces){
        await page.setContent(html);
        if(descriptionSelector){
          const rendered=await page.locator(descriptionSelector).allTextContents();
          check(`authored description survives ${record.id}/${surface}`,rendered.length===1&&rendered[0]===description,{expected:description,rendered});
        }
        const text=await page.locator("body").innerText();
        const missing=missingAuthoredRules(expected,text);
        check(`authored rules survive ${record.id}/${surface}`,!missing.length,{missing});
        evidence.surfaces.push({surface,missing});
      }
      if(profiles[record.id]){
        const profile=profiles[record.id];
        check(`reviewed inline source ${record.id}`,profile.source.path===record.source.path&&(profile.reviewedSha256??[profile.source.sha256]).includes(record.source.sha256));
        check(`reviewed roll clauses ${record.id}`,JSON.stringify(record.reference.rollOutcomes)===JSON.stringify(profile.outcomes));
        check(`native roll clauses ${record.id}`,["weak","standard","strong"].every(tier=>item?.system.outcomes[tier]===profile.outcomes[tier]));
      }
      for(const annotation of common.filter(row=>row.name===record.name)){
        check(`reviewed common anchor in source ${record.id}`,source.includes(annotation.anchor));
        check(`common procedure outside Strong ${record.id}`,!JSON.stringify(record.reference.rollOutcomes?.strong??"").includes(annotation.anchor)&&!JSON.stringify(item?.system.outcomes?.strong??"").includes(annotation.anchor));
        check(`common procedure preserved ${record.id}`,record.reference.rules.body.some(block=>block.text?.includes(annotation.anchor)));
      }
      if(record.name==="Triage"){
        const expected={weak:[6,4],standard:[11,7],strong:[16,10]};
        for(const [tier,values]of Object.entries(expected))check(`Triage both profiles ${tier}`,values.every(value=>new RegExp(`\\b${value} HP`).test(item?.system.outcomes[tier]??"")));
      }
      if(record.name==="Twin Strike")for(const [tier,value]of Object.entries({weak:1,standard:2,strong:3}))check(`Twin Strike ${tier}`,new RegExp(`\\b${value} physical damage`).test(item?.system.outcomes[tier]??""));
      report.records.push(evidence);
    }
  } finally {await browser.close();}
  report.summary={records:report.records.length,checks:report.checks.length,failures:report.failures.length,abilities:rows.filter(row=>row.kind==="ability").length,traits:rows.filter(row=>row.kind==="trait").length,reviewedProfiles:Object.keys(profiles).length,commonScopes:common.length};
  await mkdir(resolve(root,output,".."),{recursive:true});await writeFile(resolve(root,output),JSON.stringify(report,null,2)+"\n");
  return report;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){const report=await auditRuleRendering();console.log(JSON.stringify(report.summary,null,2));if(report.failures.length)process.exitCode=1;}
