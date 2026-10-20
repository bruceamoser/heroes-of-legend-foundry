import { readFile, readdir } from "node:fs/promises";
import { createHash } from "node:crypto";
export async function validateNativeJournals(root) {
  const lock = JSON.parse(await readFile(new URL("content/source-lock.json", root)));
  const index = JSON.parse(await readFile(new URL("static/data/journal-index.json", root)));
  const expected = lock.records.filter(record => record.path.endsWith(".md"));
  if (index.sourceCommit !== lock.commit || index.records.length !== expected.length || new Set(index.records.map(record => record.path)).size !== expected.length) throw new Error("Native journal coverage differs from the pinned sources.");
  for (const record of index.records) {
    if (expected.find(source => source.path === record.path)?.sha256 !== record.sha256) throw new Error(`Unpinned journal source: ${record.path}`);
    const restricted = /^design\/(da-book|bestiary|monster-abilities)\//.test(record.path);
    if (record.pack !== (restricted ? "da-rules" : "player-rules")) throw new Error(`Incorrect journal audience: ${record.path}`);
    const bytes = await readFile(new URL(`content/journals/${record.pack}/${record.id}.json`, root));
    if (createHash("sha256").update(bytes).digest("hex") !== record.documentSha256) throw new Error(`Native journal drift: ${record.path}`);
    const document = JSON.parse(bytes);
    if (document._key !== `!journal!${record.id}` || document.pages?.[0]?._key !== `!journal.pages!${record.id}.${record.pageId}`) throw new Error(`Missing native journal packing identity: ${record.path}`);
    if (document.ownership.default !== (restricted ? 0 : 2)) throw new Error(`Incorrect journal ownership: ${record.path}`);
  }
  for (const name of ["player-rules", "da-rules"]) {
    const files = await readdir(new URL(`content/journals/${name}/`, root));
    if (files.length !== index.records.filter(record => record.pack === name).length) throw new Error(`Unexpected native journal files: ${name}`);
  }
  return index;
}
