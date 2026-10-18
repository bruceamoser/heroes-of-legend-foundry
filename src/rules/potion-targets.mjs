/** Map native token targets to one exact encounter recipient; an untargeted use is self. */
export function selectPotionRecipient({ giver, participants, targets = [] }) {
  const others = targets.filter((target) => target.actorUuid !== giver.actorUuid);
  if (others.length > 1)
    return { participantId: null, name: "Multiple targets", error: "Use one target." };
  if (!others.length)
    return { participantId: giver.id, name: `${giver.name} (self)`, error: "" };
  const target = others[0];
  if (participants === null) {
    if (!target.tokenUuid || !target.actorUuid)
      return { participantId: null, name: "Unavailable", error: "Target a creature token." };
    return { participantId: target.actorUuid, tokenUuid: target.tokenUuid, name: target.name, error: "" };
  }
  const
    participant = participants.find((entry) =>
      entry.tokenUuid && entry.tokenUuid === target.tokenUuid &&
      entry.actorUuid === target.actorUuid,
    );
  if (!participant)
    return {
      participantId: null, name: "No encounter recipient",
      error: "Target a token in this encounter.",
    };
  return { participantId: participant.id, name: participant.name, error: "" };
}
