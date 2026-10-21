/** Older catalog descriptions contain only generated bookkeeping, not authored prose.
 * Keep user HTML intact and omit the exact metadata-only wrapper from the editor. */
export function equipmentEditableDescription(description="") {
  const wrapper=/^<section class="hol-item-reference">([\s\S]*)<\/section>$/.exec(description);
  if(!wrapper)return description;
  const rest=wrapper[1].replace(/<p class="hol-automation-label">[\s\S]*?<\/p>/g,"").replace(/<p class="hol-reference-source">[\s\S]*?<\/p>/g,"").replace(/<p><strong>(?:Market price|Normal supply die):<\/strong>[^<]*<\/p>/g,"").trim();
  return rest ? description : "";
}
