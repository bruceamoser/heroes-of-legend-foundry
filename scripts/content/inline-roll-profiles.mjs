import { createHash } from "node:crypto";
import profiles from "./inline-roll-profiles.json" with { type: "json" };

/** Reviewed, source-pinned tier clauses for inline prose (issue #263).
 * This is roll metadata, not replacement rules. Full authored procedures remain
 * in the reference body. Source changes require reviewing these clauses again.
 */
export function reviewedInlineRollOutcomes(markdown) {
  const id = markdown.match(/^\*\*ID:\*\* ([^\n]+)$/m)?.[1];
  const profile = profiles[`ability-${id}`];
  if (!profile) return undefined;
  // Explicit authored lists already provide their own unambiguous structure.
  const rules = markdown.split("## Rules")[1]?.split(/\n---\n/)[0] ?? "";
  if (!rules.split(/\n\s*\n/).some(block => !block.trim().startsWith("- ") && /\bWeak\b/.test(block) && /\bStandard\b/.test(block) && /\bStrong\b/.test(block))) return undefined;
  const sha256 = createHash("sha256").update(markdown).digest("hex");
  if (!(profile.reviewedSha256 ?? [profile.source.sha256]).includes(sha256))
    throw new Error(`Review inline roll profile after source change: ${profile.source.path}`);
  return structuredClone(profile.outcomes);
}
