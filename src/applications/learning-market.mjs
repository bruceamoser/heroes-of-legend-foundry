import { abilityHeaderBadges } from "../rules/workshop-card-view.mjs";

export function learningCardView(record, choices) {
  if (!record) return {actionCode:"",actionLabel:"",marks:[]};
  const badges = abilityHeaderBadges(record);
  const requirements = record.kind === "discipline" ? [{id:record.id,rank:1}] : badges.disciplines;
  return {
    actionCode: badges.codes.join("/"), actionLabel: badges.action,
    marks: requirements.map(requirement => ({...requirement,
      name: choices.find(choice => choice.id === requirement.id)?.name ?? requirement.id,
      src: `systems/heroes-of-legend/assets/marks/${requirement.id.replace(/^discipline-/, "")}.webp`,
      rankLabel: requirement.rank > 1 ? requirement.rank : "",
    })),
  };
}

/** A native modal keeps purchases beside the persistent Current Build draft. */
export function bindLearningMarket(app) {
  const root = app.element.querySelector(".hol-wizard");
  if (!root || root.dataset.marketBound) return;
  root.dataset.marketBound = "true";
  const show = (kind) => {
    const dialog = root.querySelector(`[data-learning-market="${kind === "equipment" ? "equipment" : "learning"}"]`);
    if (!dialog) return;
    app.marketKind = kind;
    for (const row of dialog.querySelectorAll("[data-choice-kind]")) row.hidden = row.dataset.choiceKind !== kind;
    const title = dialog.querySelector("[data-market-title]");
    if (title) title.textContent = kind === "ability" ? "Learn abilities" : kind === "discipline" ? "Learn discipline" : "Buy equipment";
    const filter = dialog.querySelector("[data-market-filter]");
    const search = dialog.querySelector("[data-search]");
    if (kind === "discipline" && filter) filter.value = "all";
    const applyFilter = () => {
      for (const row of dialog.querySelectorAll("[data-search-name]")) {
        const discipline = filter?.value ?? "all";
        row.hidden = (row.dataset.choiceKind && row.dataset.choiceKind !== app.marketKind) || (search?.value && !row.dataset.searchName.toLowerCase().includes(search.value.toLowerCase())) || (discipline === "universal" ? row.dataset.universal !== "true" : discipline !== "all" && !(row.dataset.disciplineIds ?? "").split(" ").includes(discipline));
      }
    };
    if (!dialog.dataset.filterBound) { dialog.dataset.filterBound = "true"; filter?.addEventListener("change", applyFilter); search?.addEventListener("input", applyFilter); }
    applyFilter();
    if (!dialog.open) dialog.showModal();
  };
  for (const button of root.querySelectorAll("[data-open-market]")) button.addEventListener("click", () => show(button.dataset.openMarket));
  for (const dialog of root.querySelectorAll("[data-learning-market]")) {
    dialog.querySelector("[data-close-market]")?.addEventListener("click", () => { app.capture(); app.marketKind = null; dialog.close(); });
    dialog.addEventListener("cancel", () => { app.capture(); app.marketKind = null; });
  }
  // Acquisition requirements can reveal dependent controls (for example melee hands).
  // Capture and persist before rebuilding the Current Build and its missing-choice banner.
  root.addEventListener("change", async (event) => {
    if (!event.target.closest?.("[data-acquisition]") || app.busy) return;
    await app.act(async () => {});
  });
  for (const button of root.querySelectorAll("[data-required-choice]")) button.addEventListener("click", async () => {
    const id = button.dataset.requiredChoice;
    let field = [...root.querySelectorAll("[data-acquisition]")].find((el) => el.dataset.acquisition === id);
    if (!field && typeof app.step === "number") {
      app.capture();
      app.step = app.preview?.stages?.[0]?.abilities.includes(id) ? 3 : 5;
      await app.render();
      field = [...app.element.querySelectorAll("[data-acquisition]")].find((el) => el.dataset.acquisition === id);
    }
    if (field) { for (let parent = field.parentElement; parent; parent = parent.parentElement) if (parent.tagName === "DETAILS") parent.open = true; field.scrollIntoView({block:"center"}); field.querySelector("input,select")?.focus(); }
  });
  if (app.marketKind) show(app.marketKind);
}
