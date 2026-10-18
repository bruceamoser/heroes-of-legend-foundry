const ID = "heroes-of-legend";

function liveAbility(item) {
  return item?.documentName === "Item" && item.type === "ability" &&
    item.actor?.items?.get?.(item.id) === item;
}

// Match the existing defender chooser: observed Actors or visible scene Tokens.
export function referenceAbilities(actor, { mode = "attribute", user = game.user, defenderTokenUuid = null } = {}) {
  const token = defenderTokenUuid ? fromUuidSync(defenderTokenUuid) : null;
  const tokens = token ? [token] : [...(game.scenes.viewed?.tokens ?? [])];
  const visible = actor.testUserPermission(user, "OBSERVER") ||
    (mode === "defense" && tokens.some(token =>
      token.actor?.uuid === actor.uuid && (!token.hidden || user.isGM)));
  if (!visible) return [];
  return actor.items.filter(liveAbility).sort((a, b) => a.name.localeCompare(b.name));
}

export function selectedReferences(actor, draft, { mode, user = game.user, defenderTokenUuid = null } = {}) {
  const ids = draft.referenceItemIds ?? [];
  if (!Array.isArray(ids) || ids.some(id => typeof id !== "string"))
    throw new Error("Choose available ability references.");
  if (!ids.length) return [];
  const available = new Map(referenceAbilities(actor, { mode, user, defenderTokenUuid }).map(item => [item.id, item]));
  return [...new Set(ids)].map(id => {
    const item = available.get(id);
    if (!item) throw new Error("An ability reference is no longer visible. Reopen the roll to review it.");
    return {
      itemUuid: item.uuid, name: item.name,
      source: structuredClone(item.getFlag(ID, "source") ?? null),
      sourceCommit: item.getFlag(ID, "sourceCommit") ?? null,
    };
  });
}

// Rebuild only a small inert formatting subset; never trust authored HTML attributes.
export function safeReferenceHTML(description) {
  const parsed = new DOMParser().parseFromString(String(description ?? ""), "text/html");
  const output = document.createElement("div");
  const allowed = new Set(["P", "DIV", "SECTION", "H1", "H2", "H3", "H4", "H5", "H6", "STRONG", "EM", "B", "I", "UL", "OL", "LI", "DL", "DT", "DD", "TABLE", "THEAD", "TBODY", "TR", "TH", "TD", "BR", "HR", "CODE", "BLOCKQUOTE", "A"]);
  const excluded = new Set(["SCRIPT", "STYLE", "IFRAME", "OBJECT", "EMBED", "SVG", "MATH", "IMG", "INPUT", "BUTTON", "FORM"]);
  function copy(node, parent) {
    if (node.nodeType === 3) { parent.append(document.createTextNode(node.textContent)); return; }
    if (node.nodeType !== 1 || excluded.has(node.tagName) ||
      (node.matches("section.secret:not(.revealed)"))) return;
    const next = allowed.has(node.tagName) ? document.createElement(node.tagName.toLowerCase()) : parent;
    if (next !== parent && node.tagName === "A") {
      try {
        const url = new URL(node.getAttribute("href"));
        if (["https:", "http:"].includes(url.protocol)) {
          next.href = url.href; next.target = "_blank"; next.rel = "noopener noreferrer";
        }
      } catch {}
    }
    if (next !== parent) parent.append(next);
    for (const child of node.childNodes) copy(child, next);
  }
  for (const child of parsed.body.childNodes) copy(child, output);
  return output.innerHTML;
}

export async function postAbilityReference(item) {
  if (!liveAbility(item) || !item.testUserPermission(game.user, "OWNER"))
    throw new Error("Only an owned ability can be posted to chat.");
  const escape = foundry.utils.escapeHTML;
  const reference = { itemUuid: item.uuid, name: item.name,
    source: structuredClone(item.getFlag(ID, "source") ?? null),
    sourceCommit: item.getFlag(ID, "sourceCommit") ?? null };
  const content = `<section class="hol-reference-card"><h2><a class="content-link" data-link data-type="Item" data-uuid="${escape(item.uuid)}">${escape(item.name)}</a></h2><p>Reference only · apply rules manually</p>${safeReferenceHTML(item.system.description)}</section>`;
  return ChatMessage.create(ChatMessage.applyMode({
    speaker: ChatMessage.getSpeaker({ actor: item.actor }), content,
    flags: { [ID]: { abilityReference: reference } },
  }));
}


export function referencePickerOptions(actor, draft, options = {}) {
  return referenceAbilities(actor, options).map(item => ({
    id: item.id, name: item.name, selected: (draft.referenceItemIds ?? []).includes(item.id),
  }));
}
export function readReferenceSelection(element) {
  return Array.from(element.querySelectorAll("[data-reference-id]:checked"), input => input.dataset.referenceId);
}
export function bindReferenceSearch(element) {
  element.querySelector("[data-reference-search]")?.addEventListener("input", event => {
    const query = event.target.value.toLocaleLowerCase();
    for (const row of element.querySelectorAll("[data-reference-row]"))
      row.hidden = !row.textContent.toLocaleLowerCase().includes(query);
  });
}
