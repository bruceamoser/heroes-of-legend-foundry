import {readFile,writeFile,mkdir,readdir} from "node:fs/promises";
import {execFileSync} from "node:child_process";
import {resolve,join} from "node:path";
import {createHash} from "node:crypto";
import {chromium} from "playwright";

// Independent outcome-label audit against immutable source. This does not call
// the importer or use its label-first regular expression as the expected value.
const pin=process.env.HOL_AUDIT_BOOK_COMMIT??"f3fb98ca03b046335fcc730c1b05689bebf091b4";
const release=process.env.HOL_AUDIT_RELEASE??"v2.7.1";
const site=process.env.HOL_AUDIT_SITE??"https://bruceamoser.github.io/heroes-of-legend-foundry/";
const book=process.env.HOL_BOOK_REPOSITORY??"/home/bmoser/repos/heroes-of-legend";
const cache=process.env.HOL_PUBLISHED_AUDIT_CACHE??"/tmp/hol-decision-audit-public";
const out=resolve("test-results/decision-audit");await mkdir(out,{recursive:true});
const catalogs=JSON.parse(await readFile(join(cache,"workshop/data/choices.json"),"utf8"));
const records=catalogs.records.filter(record=>record.kind==="ability");
const plain=text=>text.replace(/\[([^\]]+)\]\([^)]+\)/g,"$1").replace(/[*`]/g,"").replace(/\s+/g," ").trim();
const report={bookCommit:pin,release,site,startedAt:new Date().toISOString(),scope:"All 427 published ability source blocks; focus on numeric value-before-tier/postfix syntax, not a general decision-conformance certification.",records:[],definiteMisassociations:[],assertions:[],live:[]};
const nativeItems=[];for(const file of await readdir(join(cache,"decoded/abilities"))){if(file.endsWith(".json"))nativeItems.push(JSON.parse(await readFile(join(cache,"decoded/abilities",file),"utf8")));}
for(const record of records){
 const bytes=execFileSync("git",["-C",book,"show",`${pin}:${record.source.path}`],{maxBuffer:1024*1024});
 const sha256=createHash("sha256").update(bytes).digest("hex");
 if(sha256!==record.source.sha256)throw Error(`Source drift ${record.id}`);
 const source=bytes.toString(),rules=source.split("## Rules")[1]?.split(/\n---\n/)[0]??"";
 const blocks=rules.trim().split(/\n\s*\n/).map(block=>block.trim()).filter(Boolean);
 const sourcePostfix=[];
 for(const [index,block]of blocks.entries()){
  // A punctuation boundary prevents an earlier HP cost or range from being
  // mistaken for the numeric value immediately preceding an outcome name.
  const valueBeforeTier=[...plain(block).matchAll(/\b(\d+)\s+([^,.;\d]*?)\bon\s+(Weak|Standard|Strong)\b/gi)].map(match=>({tier:match[3],value:Number(match[1]),unit:match[2].trim(),exact:match[0],offset:match.index}));
  if(valueBeforeTier.length)sourcePostfix.push({index,source:block,values:valueBeforeTier});
 }
 const catalogBlocks=record.reference.rules.body;
 const row={id:record.id,name:record.name,source:record.source,sourceSha256Verified:true,
  sourceTierMentions:[...rules.matchAll(/\b(Weak|Standard|Strong)\b/gi)].length,
  sourceBlocks:blocks.map((block,index)=>({index,source:block,tierNames:[...block.matchAll(/\b(Weak|Standard|Strong)\b/gi)].map(match=>match[1])})),
  postfixBlocks:sourcePostfix,catalogOutcomeBlocks:catalogBlocks.filter(block=>block.outcomes),catalogProseBlocks:catalogBlocks.filter(block=>!block.outcomes),
  publishedNativeOutcomes:nativeItems.find(item=>item.flags?.["heroes-of-legend"]?.catalogId===record.id)?.system.outcomes};
 report.records.push(row);
 if(sourcePostfix.some(block=>new Set(block.values.map(value=>value.tier.toLowerCase())).size===3)){
  const first=sourcePostfix.find(block=>new Set(block.values.map(value=>value.tier.toLowerCase())).size===3);
  const expected=Object.fromEntries(["Weak","Standard","Strong"].map(tier=>[tier,first.values.find(value=>value.tier.toLowerCase()===tier.toLowerCase()).value]));
  const parsed=catalogBlocks.find(block=>block.outcomes);
  const actual=parsed?Object.fromEntries(parsed.outcomes.map(outcome=>[outcome.label,{text:outcome.text,firstNumericValue:Number(outcome.text.match(/\d+/)?.[0])}])):null;
  const unchangedProse=!parsed&&catalogBlocks.some(block=>block.text&&plain(block.text).includes(plain(first.source)));
  const pass=unchangedProse||actual&&Object.entries(expected).every(([tier,value])=>actual[tier]?.firstNumericValue===value);
  report.assertions.push({id:record.id,name:record.name,assertion:"Postfix numeric values stay attached to their authored outcome tiers",pass:Boolean(pass),expectedFirstProfile:expected,actual});
  if(!pass)report.definiteMisassociations.push({...row,expectedFirstProfile:expected,actual,publishedNativeDescriptionMissingPreface:true,sourceExact:first.source});
 }
}
// These annotations are a review of every multi-sentence Strong tail in the
// 36 inline-triad cards. They name exact source spans and explain their scope;
// a full sentence after Strong is not automatically an error.
const reviewedGlobalSpans=[
 ["Reckless Charge","Take 1 Bane on defense rolls","The defense penalty and ordinary opportunity-attack movement apply after the whole attack, not just Strong."],
 ["Get Out of Here","Choose the direction.","All three tiers throw the target; direction, landing Prone and collisions therefore apply to every throw."],
 ["Cleave","Resolve collisions normally.","Standard also pushes; its collisions cannot be restricted to Strong."],
 ["Relentless Pursuit","Slowed uses normal decay.","Every tier applies Slowed, so the condition's decay rule applies to all three."],
 ["Shatter the Guard","The target loses 1 resistance","This separate sentence follows the three damage clauses and grants the shared resistance loss/ally benefit."],
 ["Radiant Threshold","The line is 1 square wide","Width, duration, ally exclusions, damage triggers, once-per-turn cap and non-blocking geometry describe every line."],
 ["Open the Way","On completion, open the lock","The completion condition, silent work and pre-roll DA risk statement apply to the progress project, not only a Strong attempt."],
 ["Fast Talk","The DA sets the progress target","The pre-roll target, completion rule and limits on persuasion apply to the entire progress procedure."],
 ["Triage","Two allies: restore 4 HP each","The two-recipient branch has its own three tiers; resistance/cap and target/recovery restrictions apply generally."],
 ["Steady Voice","If the target has neither condition","The source explicitly names both Standard and Strong here; placing it exclusively in Strong hides Standard applicability."],
 ["Mend","Reduce the restored amount","Life resistance, the healing cap, stabilization prerequisite, wound limit and Last Words limit govern every beneficial result."],
 ["Mend the Wound","This counts as the wound's one treatment attempt","The daily treatment count, kit exception and no-direct-HP/no-scar-removal limits govern every treatment result."],
 ["The Cannonball","If you cannot move at least 2 squares","The minimum movement prerequisite and collision procedure apply to the ability. Strong's preceding self-damage/Daze sentence remains correctly Strong-specific."],
 ["Rampage","If you cannot move at least 2 squares","Minimum movement and no-further-movement limits apply to the charge, not solely its Strong result."],
 ["Grab and Hurl","Resolve collisions normally.","Standard also throws; collision resolution and ending this ability's grapple apply to that throw too."],
 ["Earthbreaker","Structures and unattended objects","Object damage, collision handling and the caster not moving describe the entire area effect."],
 ["Charge","Resolve collisions normally.","Every result pushes; collision handling and the minimum-movement prerequisite apply to the whole charge."],
 ["The Green Spear","The spear disappears after the attack.","The spear's disappearance and ammunition/free-hand exceptions govern the attack on every result."],
 ["Twin Strike","You can target the same creature","Target allocation and the after-both-attacks defense Boon govern the complete two-attack procedure."],
 ["Death from the Blind Spot","If you cannot reach a square adjacent","This is an ability-use prerequisite, not a restriction that begins only after a Strong result."],
 ["Volley","Roll once using the worst applicable","Worst-pool selection, per-target resistance and one-hit-per-use govern every target and result."],
];
report.strongSuffixCandidates=report.records.flatMap(row=>row.catalogOutcomeBlocks.filter(block=>block.text&&block.outcomes?.find(outcome=>outcome.label==="Strong")?.text.match(/[.!?]\s+[A-Z]/)).map(block=>({id:row.id,name:row.name,source:row.source,catalogStrong:block.outcomes.find(outcome=>outcome.label==="Strong").text})));
report.reviewedGlobalProcedures=reviewedGlobalSpans.map(([name,anchor,scope])=>{
 const row=report.records.find(row=>row.name===name),block=row.sourceBlocks.find(block=>plain(block.source).includes(anchor)),catalog=row.catalogOutcomeBlocks.find(block=>block.outcomes.some(outcome=>outcome.label==="Strong"&&outcome.text.includes(anchor)));
 if(!block)throw Error(`Reviewed source anchor no longer resolves; review the decision scope again: ${name}`);
 const sourcePlain=plain(block.source),exact=sourcePlain.slice(sourcePlain.indexOf(anchor));
 const entry={id:row.id,name,anchor,source:row.source,sourceExact:exact,expectedScope:scope,catalogStrong:catalog?.outcomes.find(outcome=>outcome.label==="Strong")?.text??null,publishedNativeOutcomes:row.publishedNativeOutcomes,reviewedSourceSha256:row.source.sha256};
 const separate=row.catalogProseBlocks.some(block=>block.text&&plain(block.text).includes(exact));
 const commonInStrong=plain(row.publishedNativeOutcomes?.strong??"").includes(anchor)||Boolean(catalog);
 report.assertions.push({id:row.id,name,assertion:"Reviewed common procedure is outside the Strong-only outcome cell",pass:separate&&!commonInStrong,expectedText:exact});
 return entry;
});
report.reviewedStrongOnly=[{name:"The Half-Second",id:report.records.find(row=>row.name==="The Half-Second").id,reason:"Each explicit tier states its own triggering-action outcome: Weak resolves; Standard and Strong interrupt. The final Strong interruption sentence correctly belongs to Strong; no global-tail defect is claimed."}];
const browser=await chromium.launch();try{
 const page=await browser.newPage({viewport:{width:1440,height:1050}});
 await page.goto(new URL("item.html",site).href);
 for(const row of report.records.filter(row=>["Triage","Twin Strike","Reckless Charge","Mend"].includes(row.name))){await page.evaluate(id=>localStorage.setItem("hol.sheet.item.v1",JSON.stringify({id,notes:"",conditions:[],collapsed:{}})),row.id);await page.reload();await page.getByText(row.name,{exact:true}).first().waitFor();const text=await page.locator("#app").innerText();await page.screenshot({path:join(out,`${row.id}-postfix-live.png`),fullPage:true});report.live.push({id:row.id,name:row.name,url:page.url(),text});}
}finally{await browser.close();}
report.summary={abilitySources:records.length,sourceHashesVerified:report.records.filter(row=>row.sourceSha256Verified).length,withStructuredOutcomes:report.records.filter(row=>row.catalogOutcomeBlocks.length).length,
 numericPostfixCards:report.records.filter(row=>row.postfixBlocks.length).length,definiteMisassociations:report.definiteMisassociations.length,strongSuffixCandidates:report.strongSuffixCandidates.length,
 reviewedGlobalProcedures:report.reviewedGlobalProcedures.length,definiteGlobalMisassociations:report.assertions.filter(row=>row.assertion==="Reviewed common procedure is outside the Strong-only outcome cell"&&!row.pass).length,reviewedStrongOnly:report.reviewedStrongOnly.length,
 assertions:report.assertions.length,failedAssertions:report.assertions.filter(row=>!row.pass).length};
report.definiteGlobalMisassociations=report.reviewedGlobalProcedures.filter(row=>report.assertions.some(assertion=>assertion.id===row.id&&assertion.assertion==="Reviewed common procedure is outside the Strong-only outcome cell"&&!assertion.pass));
report.finishedAt=new Date().toISOString();
await writeFile(join(out,"inline-outcome-audit.json"),JSON.stringify(report,null,2)+"\n");
console.log(JSON.stringify(report.summary,null,2));
if(report.assertions.some(row=>!row.pass))process.exitCode=1;
