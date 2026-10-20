import { readFile, readdir } from "node:fs/promises";
import { createHash } from "node:crypto";
export async function validateNativeJournals(root) {
  const lock = JSON.parse(await readFile(new URL("content/source-lock.json", root)));
  const index = JSON.parse(await readFile(new URL("static/data/journal-index.json", root)));
  const expected = lock.records.filter(record => record.path.endsWith(".md"));
  if (index.sourceCommit !== lock.commit || index.records.length !== expected.length || new Set(index.records.map(record => record.path)).size !== expected.length) throw new Error("Native journal coverage differs from the pinned sources.");
  if (index.books?.length !== 2) throw new Error("Exactly two native audience books are required.");
  const documents = new Map();
  for (const book of index.books) {
    const files = await readdir(new URL(`content/journals/${book.pack}/`, root));
    if (files.length !== 1 || files[0] !== `${book.id}.json`) throw new Error(`Expected one native book: ${book.pack}`);
    const bytes = await readFile(new URL(`content/journals/${book.pack}/${book.id}.json`,root));
    const document = JSON.parse(bytes);
    if (document._key !== `!journal!${book.id}` || document.flags?.["heroes-of-legend"]?.ruleBook?.key !== book.pack) throw new Error("Invalid book identity.");
    if (document.ownership.default !== (book.pack === "da-rules" ? 0 : 2)) throw new Error("Incorrect book ownership.");
    if (document.pages.length !== book.sourcePages + book.sectionPages || new Set(document.pages.map(page => page._id)).size !== document.pages.length) throw new Error("Invalid native book page coverage.");
    documents.set(book.pack,{document,hash:createHash("sha256").update(bytes).digest("hex")});
  }
  for (const record of index.records) {
    if (expected.find(source => source.path === record.path)?.sha256 !== record.sha256) throw new Error(`Unpinned journal source: ${record.path}`);
    const restricted = /^design\/(da-book|bestiary|monster-abilities)\//.test(record.path);
    if (record.pack !== (restricted ? "da-rules" : "player-rules")) throw new Error(`Incorrect journal audience: ${record.path}`);
    const {document,hash} = documents.get(record.pack);
    const page = document.pages.find(page => page._id === record.pageId);
    if (hash !== record.documentSha256 || record.id !== document._id || !page || page._key !== `!journal.pages!${record.id}.${record.pageId}` || page.flags?.["heroes-of-legend"]?.ruleSource?.sha256 !== record.sha256 || page.sort !== record.sort || !page.text.content.includes('class="hol-journal-page"')) throw new Error(`Native page drift: ${record.path}`);
    if (!restricted && page.text.content.includes("Compendium.heroes-of-legend.da-rules")) throw new Error("DA link leaked into player book.");
  }
  return index;
}
