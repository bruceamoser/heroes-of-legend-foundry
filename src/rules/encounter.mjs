/** Alternating sides; document permissions and phase effects belong to the service. */
const SIDES = ["players", "opposition"];
const other = (side) => (side === "players" ? "opposition" : "players");
function participant(p) {
  if (
    !p ||
    typeof p.id !== "string" ||
    !/^[A-Za-z0-9_-]+$/.test(p.id) ||
    !SIDES.includes(p.side)
  )
    throw new Error("Invalid encounter participant.");
  return { id: p.id, side: p.side };
}
export function startEncounter(participants, faces) {
  if (
    !Array.isArray(faces) ||
    faces.length !== 3 ||
    faces.some((n) => !Number.isInteger(n) || n < 1 || n > 6)
  )
    throw new Error("Opening roll requires three unmodified d6.");
  const roster = participants.map(participant);
  if (!roster.length || new Set(roster.map((p) => p.id)).size !== roster.length)
    throw new Error("Choose a nonempty unique roster.");
  const total = faces.reduce((a, b) => a + b, 0),
    startingSide = total >= 12 ? "players" : "opposition";
  const state = {
    schemaVersion: 1,
    revision: 1,
    round: 1,
    serial: 0,
    startingSide,
    nextSide: startingSide,
    current: null,
    acted: [],
    opening: { faces: [...faces], total },
    roster: roster.map((p) => ({ ...p, eligibleRound: 1, withdrawn: false })),
    history: [],
  };
  state.nextSide = availableSide(state, startingSide);
  return state;
}
export function availableParticipants(state, side = state.nextSide) {
  return state.roster.filter(
    (p) =>
      p.side === side &&
      !p.withdrawn &&
      p.eligibleRound <= state.round &&
      !state.acted.includes(p.id),
  );
}
function availableSide(state, desired) {
  return availableParticipants(state, desired).length
    ? desired
    : availableParticipants(state, other(desired)).length
      ? other(desired)
      : null;
}
function audit(state, kind, data) {
  state.revision++;
  state.history.push({
    kind,
    round: state.round,
    serial: state.serial,
    ...data,
  });
  return state;
}
export function chooseParticipant(state, id) {
  if (state.current)
    throw new Error("Finish the current turn before choosing another.");
  const allowed = availableParticipants(state);
  if (!allowed.some((p) => p.id === id))
    throw new Error("Choose an unacted participant on the current side.");
  const next = structuredClone(state);
  next.current = id;
  next.serial++;
  return audit(next, "start", { id });
}
export function finishTurn(state) {
  if (!state.current) throw new Error("No current turn to finish.");
  const next = structuredClone(state),
    id = next.current,
    side = next.roster.find((p) => p.id === id)?.side;
  if (!side) throw new Error("Current participant is missing from the roster.");
  if (!next.acted.includes(id)) next.acted.push(id);
  next.current = null;
  if (next.budgets?.[id]) {
    delete next.budgets[id].bonusMovement;
    delete next.budgets[id].disengaged;
  }
  audit(next, "end", { id });
  next.nextSide = availableSide(next, other(side));
  if (!next.nextSide && next.roster.some((p) => !p.withdrawn)) {
    next.round++;
    next.acted = [];
    next.nextSide = availableSide(next, next.startingSide);
  }
  return next;
}
export function changeRoster(state, { id, side, mode, reason = "" }) {
  if (!["join-now", "join-next-round", "withdraw"].includes(mode))
    throw new Error("Unknown roster decision.");
  if (state.current === id)
    throw new Error(
      "Finish the current participant's turn before withdrawing or changing it.",
    );
  let next = structuredClone(state),
    existing = next.roster.find((p) => p.id === id);
  if (mode === "withdraw") {
    if (!existing || existing.withdrawn)
      throw new Error("Participant is not active in the roster.");
    existing.withdrawn = true;
  } else {
    participant({ id, side });
    if (existing && !existing.withdrawn)
      throw new Error("Participant is already in the roster.");
    const added = {
      id,
      side,
      eligibleRound: next.round + Number(mode === "join-next-round"),
      withdrawn: false,
    };
    if (existing) Object.assign(existing, added);
    else next.roster.push(added);
    // Returning this round never erases a turn already taken.
  }
  if (!next.current) {
    next.nextSide = availableSide(next, next.nextSide ?? next.startingSide);
    if (!next.nextSide && next.roster.some((p) => !p.withdrawn)) {
      next.round++;
      next.acted = [];
      next.nextSide = availableSide(next, next.startingSide);
    }
  }
  return audit(next, "roster", { id, side, mode, reason: reason.trim() });
}

/** Table-selected turns, once per participant each round; no side or action gates. */
export function startTurnSelection(participants) {
  const roster=participants.map(participant);
  if(!roster.length || new Set(roster.map(p=>p.id)).size!==roster.length)throw new Error("Choose a nonempty unique roster.");
  return {schemaVersion:3,revision:1,round:1,serial:0,current:null,acted:[],roster:roster.map(p=>({...p,withdrawn:false})),history:[]};
}
/** Derive the current native roster without mutating the saved encounter.
 * A deleted last participant can complete a round even when nobody can Finish.
 * Display and execution derive from the same saved state, so previews cannot
 * repeatedly advance the persisted round. */
export function reconcileTurnRoster(state,participants) {
  const next=structuredClone(state),roster=participants.map(participant);
  if(new Set(roster.map(p=>p.id)).size!==roster.length)throw new Error("Choose a unique roster.");
  const ids=new Set(roster.map(p=>p.id));
  next.roster=roster.map(p=>({...p,withdrawn:false}));
  next.acted=[...new Set((next.acted??[]).filter(id=>ids.has(id)))];
  if(next.current&&!ids.has(next.current))next.current=null;
  if(!next.current&&roster.length&&roster.every(p=>next.acted.includes(p.id))){next.round++;next.acted=[];}
  return next;
}
export function availableTurnParticipants(state) {
  return state.current?[]:state.roster.filter(p=>!p.withdrawn&&!(state.acted??[]).includes(p.id));
}
export function selectTurn(state,id) {
  if(state.current)throw new Error("Finish the current turn before choosing another.");
  if(!availableTurnParticipants(state).some(p=>p.id===id))throw new Error("Choose a participant who has not acted this round.");
  const next=structuredClone(state);next.schemaVersion=3;next.current=id;next.serial=(next.serial??0)+1;next.acted??=[];
  delete next.budgets;delete next.opening;delete next.nextSide;delete next.startingSide;
  return audit(next,"start",{id});
}
export function finishSelectedTurn(state) {
  if(!state.current)throw new Error("No current turn to finish.");
  const next=structuredClone(state),id=next.current;next.current=null;next.schemaVersion=3;
  next.acted=[...new Set([...(next.acted??[]),id])];
  delete next.budgets;delete next.opening;delete next.nextSide;delete next.startingSide;
  audit(next,"end",{id});
  const active=next.roster.filter(p=>!p.withdrawn);
  if(active.length&&active.every(p=>next.acted.includes(p.id))){next.round++;next.acted=[];}
  return next;
}
