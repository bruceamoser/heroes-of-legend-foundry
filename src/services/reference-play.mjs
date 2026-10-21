import {abilityRollConfiguration} from "../rules/ability-roll.mjs";
import {attackEquipmentSnapshot} from "./attack-equipment.mjs";
import {rollReferenceApplies,reactionTrigger} from "../rules/ability-roll-relevance.mjs";
const ID = "heroes-of-legend";

function liveAbility(item) {
  return item?.documentName === "Item" && item.type === "ability" &&
    item.actor?.items?.get?.(item.id) === item;
}

// Match the existing defender chooser: observed Actors or visible scene Tokens.
export function referenceAbilities(actor, { mode = "attribute", user = game.user, defenderTokenUuid = null, attributeKey, initiatingItemId = null } = {}) {
  const token = defenderTokenUuid ? fromUuidSync(defenderTokenUuid) : null;
  const tokens = token ? [token] : [...(game.scenes.viewed?.tokens ?? [])];
  const visible = actor.testUserPermission(user, "OBSERVER") ||
    (mode === "defense" && tokens.some(token =>
      token.actor?.uuid === actor.uuid && (!token.hidden || user.isGM)));
  if (!visible) return [];
  return actor.items.filter(item=>liveAbility(item)&&rollReferenceApplies(item,{mode,attributeKey,initiatingItemId})).sort((a, b) => a.name.localeCompare(b.name));
}

export function selectedReferences(actor, draft, { mode, user = game.user, defenderTokenUuid = null, attributeKey, initiatingItemId = draft.abilityItemId } = {}) {
  const ids = draft.referenceItemIds ?? [];
  if (!Array.isArray(ids) || ids.some(id => typeof id !== "string"))
    throw new Error("Choose available ability references.");
  if (!ids.length) return [];
  const available = new Map(referenceAbilities(actor, { mode, user, defenderTokenUuid,attributeKey,initiatingItemId }).map(item => [item.id, item]));
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

export async function postAbilityReference(item,{weaponItemId=null}={}) {
  if (!liveAbility(item) || !item.testUserPermission(game.user, "OWNER"))
    throw new Error("Only an owned ability can be posted to chat.");
  const escape = foundry.utils.escapeHTML;
  const parsed = new DOMParser().parseFromString(String(item.system.description ?? ""),"text/html");
  const {loadCatalogs}=await import("./catalog.mjs");
  const catalogId=item.getFlag(ID,"catalogId");
  const record=catalogId ? (await loadCatalogs()).choices.find(record=>record.id===catalogId) : null;
  const trigger=reactionTrigger(record);
  const equipment=attackEquipmentSnapshot(item.actor,abilityRollConfiguration(item,record),weaponItemId);
  const operative = parsed.querySelector(".hol-reference-rules")?.innerHTML ?? parsed.body.innerHTML;
  const reference = { itemUuid: item.uuid, name: item.name, ...(equipment?{equipment}:{}),
    source: structuredClone(item.getFlag(ID, "source") ?? null),
    sourceCommit: item.getFlag(ID, "sourceCommit") ?? null,
    trigger, damageText: new DOMParser().parseFromString(operative, "text/html").body.textContent };
  const content = `<section class="hol-reference-card hol-chat-card"><header class="hol-chat-header"><h3>${escape(equipment?.name??item.name)}</h3></header>${equipment?`<div class="hol-chat-bar">${escape(item.name)}</div>`:""}${trigger?`<p class="hol-chat-trigger"><strong>Trigger:</strong> ${escape(trigger)}</p>`:""}<div class="hol-chat-effect">${safeReferenceHTML(operative)}</div><footer class="hol-chat-footer"><a class="content-link" data-link data-type="Item" data-uuid="${escape(item.uuid)}">Full ability details</a></footer></section>`;
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

const referenceDropRoots = new WeakSet(), referenceDropContexts = new WeakMap();

/** Native UUID drops select the same inert references as the checkbox picker. */
export function bindReferenceDrops(element, getContext, onSelected) {
  referenceDropContexts.set(element, { getContext, onSelected });
  if (referenceDropRoots.has(element)) return;
  referenceDropRoots.add(element);
  const feedback = (message, invalid = false) => {
    const status = element.querySelector("[data-reference-drop-status]");
    if (status) {
      status.textContent = message;
      status.classList.toggle("hol-error", invalid);
    }
  };
  element.addEventListener("dragover", (event) => {
    if (!Array.from(event.dataTransfer?.types ?? []).includes("text/plain")) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
    element.classList.add("hol-reference-drop-hover");
    feedback("Drop an ability reference from this character.");
  });
  element.addEventListener("dragleave", (event) => {
    if (!element.contains(event.relatedTarget)) element.classList.remove("hol-reference-drop-hover");
  });
  element.addEventListener("drop", async (event) => {
    event.preventDefault();
    event.stopPropagation();
    element.classList.remove("hol-reference-drop-hover");
    try {
      let data;
      try { data = JSON.parse(event.dataTransfer?.getData("text/plain") ?? ""); }
      catch { throw new Error("Drop an ability reference from this character."); }
      if (data?.type !== "Item" || typeof data.uuid !== "string" || !data.uuid)
        throw new Error("Drop an ability reference from this character.");
      const initial = referenceDropContexts.get(element).getContext(),
        item = await fromUuid(data.uuid),
        current = referenceDropContexts.get(element), context = current.getContext();
      if (context.actor.uuid !== initial.actor.uuid || !liveAbility(item) || item.actor.uuid !== context.actor.uuid)
        throw new Error("Use an ability owned by this dialog's character. Compendium drops cannot grant abilities.");
      const draft = { referenceItemIds: [...readReferenceSelection(element), item.id] };
      selectedReferences(context.actor, draft, context.options);
      const input = Array.from(element.querySelectorAll("[data-reference-id]")).find(input => input.dataset.referenceId === item.id);
      if (!input) throw new Error("The available references changed. Reopen the dialog.");
      input.checked = true;
      const picker = input.closest(".hol-reference-picker");
      if (picker) picker.open = true;
      await current.onSelected();
      feedback(`Selected ${item.name} · reference only.`);
    } catch (error) { feedback(error.message, true); }
  });
}
