const escape = value => String(value).replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;");
/** A native chapter page is a usable contents page, never a decorative divider.
 * Names and destinations come solely from that chapter's pinned source records. */
export function chapterContentsHTML(name,pages) {
  if(!Array.isArray(pages)||!pages.length)throw new Error("A chapter contents page needs source pages.");
  if(pages.some(page=>!page.name||!/^Compendium\.heroes-of-legend\.(?:player-rules|da-rules)\.JournalEntry\.[A-Za-z0-9]+\.JournalEntryPage\.[A-Za-z0-9]+$/.test(page.uuid)))throw new Error("A chapter contents link must target a native rules page.");
  return `<section class="hol-journal-page hol-journal-section"><nav aria-label="${escape(name)} contents"><h2>Contents</h2><ul>${pages.map(page=>`<li>@UUID[${page.uuid}]{${escape(page.name.replace(/[{}]/g,""))}}</li>`).join("")}</ul></nav></section>`;
}
