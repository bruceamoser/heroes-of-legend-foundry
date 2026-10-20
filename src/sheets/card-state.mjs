const ID = "heroes-of-legend";
const stateKey = (document) => `${ID}.card.${game.user.id}.${document.uuid}`;
export function cardContext(app, document) {
  let collapsed = {};
  try { collapsed = JSON.parse(localStorage.getItem(stateKey(document)) ?? "{}"); } catch {}
  if (["ability","equipment"].includes(document.type)) collapsed={itemNotes:true,...collapsed};
  return { cardEditing: Boolean(app._cardEditing && app.isEditable), cardCollapsed: collapsed };
}
/** Disclosure preferences are client UI state, never a change to the Actor. */
export function bindCardState(app, document) {
  const root = app.element.querySelector(".hol-native-card");
  if (!root || root.dataset.cardBound) return;
  root.dataset.cardBound = "true";
  root.querySelectorAll("details[data-card-section]").forEach((details) => {
    const remember = (collapsed) => {
      let state = {};
      try { state = JSON.parse(localStorage.getItem(stateKey(document)) ?? "{}"); } catch {}
      state[details.dataset.cardSection] = collapsed;
      try { localStorage.setItem(stateKey(document), JSON.stringify(state)); } catch {}
    };
    details.addEventListener("toggle", () => remember(!details.open));
    details.querySelector(":scope > summary")?.addEventListener("click", () => remember(details.open));
  });
}
export async function toggleCardEdit() {
  if (!this.isEditable) return;
  try {
    if (this._cardEditing) await this.submit();
    this._cardEditing = !this._cardEditing;
    await this.render({ force: true });
  } catch (error) { ui.notifications.error(error.message); }
}
export function mitigationLabel(value) {
  return [...(value?.numeric ?? []).map(({type, value}) => `${type} ${value}`), ...(value?.special ?? []).map(({type, reference}) => `${type}: ${reference}`)].join("; ") || value?.sourceText?.trim() || "None";
}
