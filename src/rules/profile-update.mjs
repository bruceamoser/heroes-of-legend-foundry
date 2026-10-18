/** Fields owned by the printed profile. Everything else is live world state. */
export function profilePaths(type, source) {
  if (type === "creature")
    return [
      "system.cv",
      "system.actions",
      ...Object.keys(source?.system?.details ?? {})
        .sort()
        .map((key) => `system.details.${key}`),
    ];
  if (type === "summon")
    return [
      "system.cv",
      "system.sourceMarkdown",
      "system.referenceMarkdown",
      "system.commandSource",
    ];
  return [];
}

export function profileValue(source, path) {
  return path.split(".").reduce((value, key) => value?.[key], source);
}

/**
 * Stable, portable FNV-1a-64 change fingerprint. It detects ordinary local
 * edits; it is not a security boundary. Pack identity and GM permission are
 * validated separately. Source-link commit pins and edge whitespace are ignored.
 */
export function profileFingerprint(value) {
  function normalized(input) {
    if (typeof input === "string")
      return input
        .trim()
        .replace(
          /(https:\/\/github\.com\/bruceamoser\/heroes-of-legend\/(?:blob|tree)\/)[a-f0-9]{40}(?=\/)/g,
          "$1<source-commit>",
        );
    if (Array.isArray(input)) return input.map(normalized);
    if (input && typeof input === "object")
      return Object.fromEntries(
        Object.keys(input)
          .sort()
          .filter((key) => !(key === "abilityId" && input[key] === ""))
          .map((key) => [key, normalized(input[key])]),
      );
    return input;
  }
  const text = JSON.stringify(normalized(value));
  let hash = 0xcbf29ce484222325n;
  for (const byte of new TextEncoder().encode(
    text === undefined ? "<missing>" : text,
  )) {
    hash = BigInt.asUintN(64, (hash ^ BigInt(byte)) * 0x100000001b3n);
  }
  return hash.toString(16).padStart(16, "0");
}

/** Pure three-way plan: only exact baseline matches may be replaced. */
export function planProfileUpdate({ actor, current, baseline }) {
  if (!actor || !current || actor.type !== current.type)
    throw new Error("Profile type mismatch.");
  const fields = profilePaths(current.type, current);
  const changes = {};
  const updated = [];
  const preserved = [];
  const currentHashes = {};
  for (const path of fields) {
    const next = profileValue(current, path);
    if (next === undefined) continue;
    const liveHash = profileFingerprint(profileValue(actor, path));
    const nextHash = profileFingerprint(next);
    currentHashes[path] = nextHash;
    if (JSON.stringify(profileValue(actor, path)) === JSON.stringify(next))
      continue;
    if (baseline?.fields?.[path] === liveHash) {
      changes[path] = structuredClone(next);
      updated.push(path);
    } else preserved.push(path);
  }
  return {
    changes,
    updated,
    preserved,
    currentHashes,
    current: preserved.length === 0,
  };
}
