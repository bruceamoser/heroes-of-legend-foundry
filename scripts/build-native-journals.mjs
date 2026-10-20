import { readFile, writeFile, mkdir, rm } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { dirname, posix } from "node:path";
import { fileURLToPath } from "node:url";
import { stableFoundryId } from "./content/item-packs.mjs";
import { renderMarkdown } from "../src/sheets/creature-reference.mjs";

const root = new URL("../", import.meta.url);
const lock = JSON.parse(await readFile(new URL("content/source-lock.json", root)));
const source = process.env.HOL_RULES_REPO ?? fileURLToPath(new URL("../../heroes-of-legend/", import.meta.url));
const output = new URL("content/journals/", root);
const records = lock.records.filter(r => r.path.endsWith(".md"));
const restricted = path => /^(design\/(da-book|bestiary|monster-abilities)\/)/.test(path);
const pack = path => restricted(path) ? "da-rules" : "player-rules";
const documentId = path => stableFoundryId(path, "native-rule-journal");
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
  return renderMarkdown(safe).replace(/HOLJOURNALLINK(\d+)END/g, (_, i) => links[Number(i)]);
}
await rm(output, { recursive: true, force: true });
const index = [];
for (const record of records) {
  const markdown = execFileSync("git", ["-C", source, "show", `${lock.commit}:${record.path}`], { encoding: "utf8" });
  if (createHash("sha256").update(markdown).digest("hex") !== record.sha256) throw new Error(`Source mismatch: ${record.path}`);
  const name = markdown.match(/^# (.+)/m)?.[1] ?? record.path.split("/").at(-1).replace(".md", "");
  const entry = {
    _key: `!journal!${documentId(record.path)}`,
    _id: documentId(record.path), name,
    categories: [],
    ownership: { default: restricted(record.path) ? 0 : 2 },
    flags: { "heroes-of-legend": { ruleSource: { ...record, commit: lock.commit, pack: pack(record.path) } } },
    pages: [{ _key: `!journal.pages!${documentId(record.path)}.${pageId(record.path)}`, _id: pageId(record.path), name, type: "text", sort: 0,
      title: { show: true, level: 1 }, text: { format: 1, content: markup(markdown, record.path) },
      ownership: { default: -1 },
    }],
  };
  const path = new URL(`${pack(record.path)}/${entry._id}.json`, output);
  await mkdir(dirname(fileURLToPath(path)), { recursive: true });
  const bytes = JSON.stringify(entry, null, 2) + "\n";
  await writeFile(path, bytes);
  index.push({ ...record, id: entry._id, pageId: pageId(record.path), name, pack: pack(record.path), uuid: uuid(record.path), documentSha256: createHash("sha256").update(bytes).digest("hex") });
}
await writeFile(new URL("static/data/journal-index.json", root), JSON.stringify({ sourceCommit: lock.commit, records: index }, null, 2) + "\n");
console.info(`Built ${index.length} pinned native journal references.`);
