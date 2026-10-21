import { readFile, writeFile, mkdir, rm } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { dirname, posix } from "node:path";
import { fileURLToPath } from "node:url";
import { stableFoundryId } from "./content/item-packs.mjs";
import { chapterContentsHTML } from "./content/journal-sections.mjs";
import { renderMarkdown } from "../src/sheets/creature-reference.mjs";

const root = new URL("../", import.meta.url);
const lock = JSON.parse(await readFile(new URL("content/source-lock.json", root)));
const source = process.env.HOL_RULES_REPO ?? fileURLToPath(new URL("../../heroes-of-legend/", import.meta.url));
const output = new URL("content/journals/", root);
const records = lock.records.filter(r => r.path.endsWith(".md"));
const restricted = path => /^(design\/(da-book|bestiary|monster-abilities)\/)/.test(path);
const pack = path => restricted(path) ? "da-rules" : "player-rules";
const documentId = path => stableFoundryId(pack(path), "native-rule-book");
const pageId = path => stableFoundryId(path, "native-rule-page");
const uuid = path => `Compendium.heroes-of-legend.${pack(path)}.JournalEntry.${documentId(path)}.JournalEntryPage.${pageId(path)}`;
const paths = new Set(records.map(r => r.path));
function markup(markdown, path) {
  const links = [];
  const safe = markdown.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, label, target) => {
    const plain = target.split("#")[0];
    const resolved = plain ? posix.normalize(posix.join(posix.dirname(path), plain)) : path;
    if (!paths.has(resolved) || (!restricted(path) && restricted(resolved))) return label;
    const key = `HOLJOURNALLINK${links.length}END`;
    links.push(`@UUID[${uuid(resolved)}]{${label.replace(/[{}]/g, "")}}`);
    return key;
  });
  const lists=[];
  const withLists=safe.replace(/(?:^- .*(?:\n|$))+/gm,block=>{
    const index=lists.length;
    lists.push(`<ul>${block.trimEnd().split("\n").map(line=>`<li>${renderMarkdown(line.slice(2)).replace(/^<p>|<\/p>$/g,"")}</li>`).join("")}</ul>`);
    return `\n\nHOLJOURNALLIST${index}END\n\n`;
  });
  return renderMarkdown(withLists).replace(/<p>HOLJOURNALLIST(\d+)END<\/p>/g,(_,i)=>lists[Number(i)]).replace(/HOLJOURNALLINK(\d+)END/g, (_, i) => links[Number(i)]);
}
// Book order follows the approved Player builder and DA source manifest. Every
// pinned source remains present, including references outside the printed books.
const playerSections = ["1 · Welcome", "2 · Create Your Hero", "3 · Ancestry, Culture and Background", "4 · Classes", "5 · Disciplines and Character Paths", "6 · Playing the Game", "7 · Beyond the Battlefield", "8 · Harm and Recovery", "9 · Abilities", "10 · Equipment and Recipes", "11 · Summoned Companions", "12 · Wound Tables", "13 · Ready-to-Play Heroes", "14 · Table References", "Source references"];
const daManifest = JSON.parse(execFileSync("git", ["-C", source, "show", `${lock.commit}:design/da-book/source-manifest.json`], {encoding:"utf8"}));
const daChapters = [...daManifest.chapters, ...daManifest.appendices].map(path => `design/${path}`);
const manuscripts = new Map();
for (const record of records) {
  const markdown = execFileSync("git", ["-C", source, "show", `${lock.commit}:${record.path}`], { encoding: "utf8" });
  if (createHash("sha256").update(markdown).digest("hex") !== record.sha256) throw new Error(`Source mismatch: ${record.path}`);
  manuscripts.set(record.path, markdown);
}
const nameOf = path => manuscripts.get(path)?.match(/^# (.+)/m)?.[1] ?? path.split("/").at(-1).replace(".md", "");
function sectionOf(path) {
  if (restricted(path)) {
    if (daChapters.includes(path)) return daChapters.indexOf(path);
    if (path.includes("/creatures/")) return 10;
    if (path.startsWith("design/monster-abilities/")) return 12;
    if (path.includes("/summons/") || path.endsWith("summon-choices.md")) return 13;
    if (path.endsWith("04a-languages.md")) return 4;
    return 15;
  }
  const chapter = path.match(/player-book\/manuscript\/(\d+)-/);
  if (chapter) return Number(chapter[1])-1;
  if (/ancestries|origins|intro-(culture|background)/.test(path)) return 2;
  if (/classes|cards\/signature-/.test(path)) return 3;
  if (/disciplines|paths/.test(path)) return 4;
  if (path.endsWith("languages.md")) return 6;
  if (/recovery|conditions/.test(path)) return 7;
  if (/cards\//.test(path)) return 8;
  if (/equipment|recipes|market/.test(path)) return 9;
  if (/summon/.test(path)) return 10;
  if (path.endsWith("wounds.md")) return 11;
  if (/characters\//.test(path)) return 12;
  if (/starting-coins|development/.test(path)) return 1;
  if (/rules\/(foundations|session-resolution|stability)/.test(path)) return 5;
  return 14;
}
// Preserve the book builders' catalog order inside their chapters rather than
// flattening every section into one alphabetized catalog.
const preferred = [];
const add = path => { if (paths.has(path) && !preferred.includes(path)) preferred.push(path); };
const alphabetic = prefix => records.filter(record => record.path.startsWith(prefix)).map(record => record.path).sort((a,b)=>nameOf(a).localeCompare(nameOf(b)));
for (const ancestry of ["human","elf","dwarf","halfling"]) {
  const path = `design/ancestries/${ancestry}.md`; add(path);
  for (const match of manuscripts.get(path)?.matchAll(/\]\((trait-[^)]+\.md)\)/g) ?? []) add(`design/ancestries/${match[1]}`);
}
for (const kind of ["culture","background"]) {
  add(`design/player-book/manuscript/intro-${kind}.md`);
  for (const path of alphabetic(`design/origins/${kind}-`)) add(path);
}
const playerBuilder = execFileSync("git",["-C",source,"show",`${lock.commit}:design/player-book/build.py`],{encoding:"utf8"});
const classOrder = [...(playerBuilder.match(/^CLASS_ORDER=\[([^\]]+)\]/m)?.[1] ?? "").matchAll(/'([^']+)'/g)].map(match=>match[1]);
for (const name of classOrder) {
  const path = `design/classes/${name}.md`; add(path);
  for (const match of manuscripts.get(path)?.matchAll(/\]\(\.\.\/cards\/(signature-[^)]+\.md)\)/g) ?? []) add(`design/cards/${match[1]}`);
}
for (const prefix of ["design/disciplines/","design/paths/"]) for (const path of alphabetic(prefix)) add(path);
for (const tier of ["Universal","1","3","7"]) for (const path of alphabetic("design/cards/")) {
  if (!path.includes("/signature-") && manuscripts.get(path).match(/\*\*Tier \/ minimum level:\*\*\s*(\w+)/)?.[1] === tier) add(path);
}
add("design/market.md");
for (const kind of ["equipment","recipes"]) {
  add(`design/player-book/manuscript/intro-${kind}.md`);
  for (const path of alphabetic(`design/${kind}/`)) add(path);
}
for (const path of daChapters) {
  add(path);
  for (const supplement of daManifest.shared_sections?.[path.replace(/^design\//,"")] ?? []) add(`design/${supplement}`);
  if (path.endsWith("10-bestiary.md")) for (const family of daManifest.families) for (const source of family.sources) add(`design/${source}`);
  if (path.endsWith("appendix-b-monster-abilities.md")) for (const source of [...daManifest.monster_abilities].sort((a,b)=>nameOf(`design/${a}`).localeCompare(nameOf(`design/${b}`)))) add(`design/${source}`);
  if (path.endsWith("appendix-c-summoned-forms.md")) for (const source of alphabetic("design/bestiary/summons/")) add(source);
}
const preferredOrder = path => preferred.includes(path) ? preferred.indexOf(path) : 100000;
const chapterFirst = path => /\/manuscript\/(?:\d+-|\d+[a-z]-|appendix-)/.test(path) ? 0 : 1;
await rm(output, { recursive: true, force: true });
const index = [], books = [];
for (const audience of ["player-rules", "da-rules"]) {
  const selected = records.filter(record => pack(record.path) === audience).sort((a,b) => sectionOf(a.path)-sectionOf(b.path) || chapterFirst(a.path)-chapterFirst(b.path) || preferredOrder(a.path)-preferredOrder(b.path) || nameOf(a.path).localeCompare(nameOf(b.path)) || a.path.localeCompare(b.path));
  const id = documentId(selected[0].path);
  const entry = {_key:`!journal!${id}`, _id:id, name: audience === "player-rules" ? "Heroes of Legend · Player’s Book" : "Heroes of Legend · Dungeon Architect’s Guide & Bestiary", categories:[], ownership:{default: audience === "player-rules" ? 2 : 0}, flags:{"heroes-of-legend":{ruleBook:{key:audience,commit:lock.commit,schema:2}}}, pages:[]};
  let lastSection;
  for (const record of selected) {
    const section = sectionOf(record.path);
    const sectionName = audience === "player-rules" ? playerSections[section] : section < daChapters.length ? nameOf(daChapters[section]) : "Source references";
    if (section !== lastSection) {
      const sectionId = stableFoundryId(`${audience}:${section}`, "native-rule-section");
      entry.pages.push({_key:`!journal.pages!${id}.${sectionId}`,_id:sectionId,name:sectionName,type:"text",sort:entry.pages.length*100000,title:{show:true,level:1},ownership:{default:-1},flags:{"heroes-of-legend":{ruleSection:section}},text:{format:1,content:chapterContentsHTML(sectionName,selected.filter(source=>sectionOf(source.path)===section).map(source=>({name:nameOf(source.path),uuid:uuid(source.path)})))}});
      lastSection = section;
    }
    const page = {_key:`!journal.pages!${id}.${pageId(record.path)}`,_id:pageId(record.path),name:nameOf(record.path),type:"text",sort:entry.pages.length*100000,title:{show:true,level:2},ownership:{default:-1},flags:{"heroes-of-legend":{ruleSource:{...record,commit:lock.commit}}},text:{format:1,content:`<article class="hol-journal-page">${markup(manuscripts.get(record.path),record.path).replace(/^<h1>[\s\S]*?<\/h1>/,"")}</article>`}};
    entry.pages.push(page);
    index.push({...record,id,pageId:page._id,name:page.name,pack:audience,uuid:uuid(record.path),legacyUuid:`Compendium.heroes-of-legend.${audience}.JournalEntry.${stableFoundryId(record.path,"native-rule-journal")}.JournalEntryPage.${page._id}`,section:sectionName,sectionOrder:section,sort:page.sort});
  }
  const target = new URL(`${audience}/${id}.json`, output);
  await mkdir(dirname(fileURLToPath(target)),{recursive:true});
  const bytes = JSON.stringify(entry,null,2)+"\n";
  await writeFile(target,bytes);
  const documentSha256 = createHash("sha256").update(bytes).digest("hex");
  for (const record of index.filter(record => record.pack === audience)) record.documentSha256 = documentSha256;
  books.push({id,pack:audience,name:entry.name,sourcePages:selected.length,sectionPages:entry.pages.length-selected.length});
}
await writeFile(new URL("static/data/journal-index.json",root),JSON.stringify({sourceCommit:lock.commit,books,records:index},null,2)+"\n");
console.info(`Built ${books.length} native books with ${index.length} pinned source pages and ${books.reduce((sum,book)=>sum+book.sectionPages,0)} section pages.`);
