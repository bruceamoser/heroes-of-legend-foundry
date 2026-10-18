import { finishCombatParticipant } from "../dialogs/turn-end.mjs";
import { chooseCombatParticipant } from "../dialogs/turn-choice.mjs";
import { displayedBudget } from "../services/turn-budget.mjs";
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
    if (game.user.isGM)
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
        const budget = displayedBudget(combat, state.current);
        if (budget) {
          line(
            `Main ${budget.remaining.main} · Maneuver ${budget.remaining.maneuver} · Reaction ${budget.remaining.reaction} · Movement ${budget.movementRemaining}`,
          );
          if (budget.movementBreakdown)
            line(budget.movementBreakdown);
          button(
            "Main → Maneuver",
            () =>
              requestCombat(combat, "convert", {
                id: state.current,
                from: "main",
                to: "maneuver",
              }),
            budget.remaining.main < 1,
          );
          button(
            "Maneuver → movement",
            () =>
              requestCombat(combat, "convert", {
                id: state.current,
                from: "maneuver",
                to: "movement",
              }),
            budget.remaining.maneuver < 1,
          );
        }
        button("Finish turn", () => finishCombatParticipant(combat));
        if (
          game.user.isGM &&
          current?.actor?.getFlag(ID, "conditionTurnPolicy")
        )
          button("Review end effects and finish", () =>
            finishCombatParticipant(combat, { review: true }),
          );
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
  for (const row of element.querySelectorAll(".combatant[data-combatant-id]")) {
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
    row.querySelector(".token-initiative")?.replaceChildren(status);
  }
  element.prepend(section);
}
