import { openEncounterPanel } from "./encounter.mjs";
import { localizeRuleLinks } from "../services/journals.mjs";
import { finishCombatParticipant } from "../dialogs/turn-end.mjs";
import { chooseCombatParticipant } from "../dialogs/turn-choice.mjs";
import { actionUses, spendOwnedAction, resetOwnedActions } from "../services/action-uses.mjs";
import { availableParticipants } from "../rules/encounter.mjs";
import { requestCombat, combatSide } from "../services/combat.mjs";
const ID = "heroes-of-legend";
/** Enhance the native V14 tracker without replacing token controls or its document collection. */
export function renderHOLCombatTracker(app, element) {
  const combat = app.viewed;
  element.querySelector(".hol-encounter")?.remove();
  if (!combat) return;
  const section = document.createElement("section");
  section.className = "hol-encounter";
  const heading=document.createElement("h3");heading.className="hol-encounter-heading";heading.textContent="Heroes of Legend · Encounter";section.append(heading);
  const state = combat.getFlag(ID, "encounter");
  const line = (text) => {
    const p = document.createElement("p");
    p.textContent = text;
    section.append(p);
  };
  const button = (label, action, disabled = false) => {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = label;
    b.disabled = disabled;
    b.addEventListener("click", async () => {
      b.disabled = true;
      try {
        await action();
      } catch (e) {
        ui.notifications.error(e.message);
      } finally {
        if (b.isConnected) b.disabled = disabled;
      }
    });
    section.append(b);
  };
  button("Open encounter",()=>openEncounterPanel(combat));
  if (!state) {
    line("HOL · One opening roll, then alternate sides.");
    for (const c of combat.combatants) {
      if (c.hidden && !game.user.isGM) continue;
      const label = document.createElement("label");
      label.textContent = c.name;
      const select = document.createElement("select");
      select.disabled = !game.user.isGM;
      for (const [value, name] of [
        ["players", "Players"],
        ["opposition", "Opposition"],
      ]) {
        const option = document.createElement("option");
        option.value = value;
        option.textContent = name;
        select.append(option);
      }
      select.value = combatSide(c);
      select.addEventListener("change", () =>
        c
          .setFlag(ID, "side", select.value)
          .catch((e) => ui.notifications.error(e.message)),
      );
      label.append(select);
      section.append(label);
    }
    if (game.user.isGM || combat.combatants.filter(participant => participant.actor?.isOwner).length > 0)
      button("Start HOL encounter", () => combat.startCombat());
  } else {
    line(
      `Round ${state.round} · ${state.current ? "Turn in progress" : state.nextSide === "players" ? "Players choose next" : state.nextSide === "opposition" ? "Opposition chooses next" : "No active participants"}`,
    );
    line(
      `Opening ${state.opening.total}: ${state.startingSide} start each round.`,
    );
    if (state.current) {
      const current = combat.combatants.get(state.current);
      line(
        current?.hidden && !game.user.isGM
          ? "Hidden participant's turn"
          : `${current?.name ?? "Removed participant"}'s turn`,
      );
      if (game.user.isGM || current?.actor?.isOwner) {
        const uses = actionUses(current.actor);
        const counters = document.createElement("div");
        counters.className = "hol-combat-budget";
        for (const [category, value] of Object.entries(uses)) {
          const stat = document.createElement("button"), number = document.createElement("strong");
          const label = category[0].toUpperCase() + category.slice(1);
          stat.type = "button";
          stat.className = "hol-budget-stat";
          stat.setAttribute("aria-label", `Use ${label}`);
          stat.append(`${label} used`); number.textContent = value; stat.append(number);
          stat.addEventListener("click", async () => {
            stat.disabled = true;
            try { await spendOwnedAction(current.actor, category); await app.render(); }
            catch (error) { ui.notifications.error(error.message); }
            finally { if (stat.isConnected) stat.disabled = false; }
          });
          counters.append(stat);
        }
        section.append(counters);
        button("Reset actions", async () => { await resetOwnedActions(current.actor); await app.render(); });
        button("Finish turn", () => finishCombatParticipant(combat));
      }
    } else {
      for (const p of availableParticipants(state)) {
        const c = combat.combatants.get(p.id);
        if (c?.hidden && !game.user.isGM) continue;
        button(
          `Choose ${c?.name ?? "removed participant"}`,
          () => chooseCombatParticipant(combat, p.id),
          !c || !(game.user.isGM || c.actor?.isOwner),
        );
      }
    }
    if (game.user.isGM) {
      const details = document.createElement("details"),
        summary = document.createElement("summary");
      summary.textContent = "DA roster decisions";
      details.append(summary);
      section.append(details);
      const reason = document.createElement("input");
      reason.placeholder = "Optional roster note";
      reason.setAttribute("aria-label", "Optional roster note");
      details.append(reason);
      for (const c of combat.combatants) {
        if (state.roster.some((p) => p.id === c.id && !p.withdrawn)) continue;
        for (const [mode, label] of [
          ["join-now", "Join this round"],
          ["join-next-round", "Join next round"],
        ]) {
          button(`${c.name}: ${label}`, () =>
            requestCombat(combat, "roster", {
              id: c.id,
              side: combatSide(c),
              mode,
              reason: reason.value,
            }),
          );
          details.append(section.lastChild);
        }
      }
      for (const p of state.roster.filter((p) => !p.withdrawn)) {
        button(
          `Withdraw ${combat.combatants.get(p.id)?.name ?? p.id}`,
          () =>
            requestCombat(combat, "roster", {
              id: p.id,
              mode: "withdraw",
              reason: reason.value,
            }),
          p.id === state.current,
        );
        details.append(section.lastChild);
      }
    }
  }
  const nativeRows = [...element.querySelectorAll(".combatant[data-combatant-id]")];
  for (const side of ["players", "opposition"]) {
    const rows = nativeRows.filter(row => (state?.roster.find(participant=>participant.id===row.dataset.combatantId)?.side??combatSide(combat.combatants.get(row.dataset.combatantId))) === side);
    for (const [index, row] of rows.entries()) {
      row.classList.toggle("hol-side-start", index === 0);
      const ready=state?.roster.filter(participant=>participant.side===side&&!participant.withdrawn&&!state.acted.includes(participant.id)&&participant.id!==state.current&&participant.eligibleRound<=state.round&&(!combat.combatants.get(participant.id)?.hidden||game.user.isGM)).length;
      row.dataset.holSide = `${side === "players" ? "Players" : "Opposition"}${state ? ` · ${ready} ready` : ""}`;
      row.parentElement.append(row);
    }
  }
  for (const row of nativeRows) {
    const id = row.dataset.combatantId,
      c = combat.combatants.get(id),
      p = state?.roster.find((p) => p.id === id);
    const status = document.createElement("span");
    status.className = "hol-turn-status";
    status.textContent = !state
      ? combatSide(c) === "players"
        ? "Players"
        : "Opposition"
      : !p
        ? "Not admitted"
        : p.withdrawn
          ? "Withdrawn"
          : state.current === id
            ? "Active"
            : state.acted.includes(id)
              ? "Acted"
              : p.eligibleRound > state.round
                ? "Next round"
                : "Ready";
    row.querySelector(".hol-turn-status")?.remove();
    (row.querySelector(".combatant-name")??row).append(status);
  }
  const rules=document.createElement("a");rules.href="#";rules.dataset.holRulePath="design/rules/encounters.md";rules.textContent="Read encounter rules";section.append(rules);
  element.prepend(section);
  localizeRuleLinks(section).catch(error=>console.error("heroes-of-legend | Encounter rules",error));
}
