import { resolveEquipmentRequest } from "../services/equipment.mjs";
import {
  resolveDefenseRequest,
  abandonDefense,
  defenseResponses,
} from "../services/defense-responses.mjs";
import { resolveNpcAttack } from "../services/npc-attacks.mjs";
import { resolveAbilityRequest } from "../services/abilities.mjs";
import { resolveConditionRequest } from "../services/conditions.mjs";
import { resolveCombatRequest } from "../services/combat.mjs";
import {
  bindCreationAuthority,
  isCreationAuthority,
  releaseAuthority,
} from "../services/authority.mjs";
import { resolveCreationRequest } from "../services/creation.mjs";
import { resolveDevelopmentRequest } from "../services/advancement.mjs";
const ID = "heroes-of-legend";
export async function retryCharacterRequest(id) {
  const message = game.messages.get(id);
  if (message?.getFlag(ID, "equipmentRequest"))
    return resolveEquipmentRequest(id);
  if (message?.getFlag(ID, "creationRequest"))
    return resolveCreationRequest(id);
  if (message?.getFlag(ID, "developmentRequest"))
    return resolveDevelopmentRequest(id);
  if (message?.getFlag(ID, "combatRequest")) return resolveCombatRequest(id);
  if (message?.getFlag(ID, "conditionRequest"))
    return resolveConditionRequest(id);
  if (message?.getFlag(ID, "abilityRequest")) return resolveAbilityRequest(id);
  if (message?.getFlag(ID, "npcAttackRequest")) return resolveNpcAttack(id);
  if (message?.getFlag(ID, "defenseRequest")) return resolveDefenseRequest(id);
  throw new Error("Unknown automation request.");
}
export class AuthorityPanel extends foundry.applications.api.HandlebarsApplicationMixin(
  foundry.applications.api.ApplicationV2,
) {
  static DEFAULT_OPTIONS = {
    classes: ["heroes-of-legend", "hol-authority"],
    window: { title: "Automation coordinator" },
    position: { width: 680, height: 650 },
    actions: {
      activate: AuthorityPanel.activate,
      release: AuthorityPanel.release,
      retry: AuthorityPanel.retry,
      resumeAbility: AuthorityPanel.resumeAbility,
      abandonDefense: AuthorityPanel.abandonDefense,
    },
  };
  static PARTS = {
    main: {
      template: "systems/heroes-of-legend/templates/authority.hbs",
      scrollable: [""],
    },
  };
  async _prepareContext() {
    if (!game.user.isGM) throw new Error("GM access required.");
    const meta = game.settings.get(ID, "authorityMeta"),
      work = game.settings.get(ID, "authorityWork");
    return {
      selected: isCreationAuthority(),
      owner: game.users.get(meta.userId)?.name ?? "Not assigned",
      busy: work.busy,
      uncertain: work.uncertain,
      canRelease: isCreationAuthority() && !work.uncertain,
      restartAvailable: Boolean(
        meta.launch && meta.launch !== game.world.lastPlayed,
      ),
      pendingDefenses: game.messages.contents
        .filter((m) => m.author?.isGM && m.getFlag(ID, "attackCard"))
        .flatMap((m) =>
          defenseResponses(m)
            .filter((r) => r.status === "rolling")
            .map((r) => ({ ...r, attackId: m.id })),
        ),
      pendingAbilities: game.combats
        .filter((c) => c.getFlag(ID, "pendingAbility"))
        .map((c) => ({
          combatUuid: c.uuid,
          id: c.getFlag(ID, "pendingAbility"),
          name: c.name ?? c.id,
        })),
      requests: game.messages
        .filter(
          (m) =>
            m.getFlag(ID, "creationRequest") ||
            m.getFlag(ID, "developmentRequest") ||
            m.getFlag(ID, "combatRequest") ||
            m.getFlag(ID, "conditionRequest") ||
            m.getFlag(ID, "equipmentRequest") ||
            m.getFlag(ID, "abilityRequest") ||
            m.getFlag(ID, "npcAttackRequest") ||
            m.getFlag(ID, "defenseRequest"),
        )
        .slice(-30)
        .reverse()
        .map((m) => ({
          id: m.id,
          author: m.author?.name ?? "Unknown",
          content: m.content.replace(/<[^>]*>/g, ""),
          request: m.getFlag(ID, "creationRequest")
            ? "Creation"
            : (m.getFlag(ID, "developmentRequest")?.kind ??
              m.getFlag(ID, "combatRequest")?.kind ??
              m.getFlag(ID, "conditionRequest")?.kind ??
              (m.getFlag(ID, "equipmentRequest")
                ? "Equipment"
                : m.getFlag(ID, "npcAttackRequest")
                  ? "NPC attack"
                  : m.getFlag(ID, "defenseRequest")
                    ? "Defense"
                    : "Ability")),
        })),
    };
  }
  static async activate() {
    try {
      await bindCreationAuthority({
        restartConfirmed:
          this.element.querySelector("[name=restartConfirmed]")?.checked ??
          false,
      });
      await this.render();
    } catch (e) {
      ui.notifications.error(e.message);
    }
  }
  static async release() {
    try {
      await releaseAuthority();
      await this.render();
    } catch (e) {
      ui.notifications.error(e.message);
    }
  }
  static async abandonDefense(event, target) {
    try {
      const choice = await foundry.applications.api.DialogV2.input({
        window: { title: "Abandon unresolved defense" },
        content:
          '<p>No saved roll may exist. This preserves the attempt without rerolling. Record the DA ruling.</p><label>Reason<input name="reason" required></label>',
        ok: { label: "Record abandonment" },
      });
      if (!choice) return;
      await abandonDefense(
        target.dataset.attack,
        target.dataset.id,
        choice.reason,
      );
      await this.render();
    } catch (e) {
      ui.notifications.error(e.message);
    }
  }
  static async resumeAbility(event, target) {
    try {
      if (!isCreationAuthority())
        throw new Error("Enable this coordinator first.");
      await resolveAbilityRequest(target.dataset.id, target.dataset.combat);
      await this.render();
    } catch (e) {
      ui.notifications.error(e.message);
    }
  }
  static async retry(event, target) {
    try {
      if (!isCreationAuthority())
        throw new Error("Enable this coordinator first.");
      await retryCharacterRequest(target.dataset.id);
      await this.render();
    } catch (e) {
      ui.notifications.error(e.message);
    }
  }
}
export function registerAuthorityPanel() {
  game.settings.registerMenu(ID, "authorityPanel", {
    name: "Automation coordinator",
    label: "Manage automation",
    hint: "Release, recover, or reconcile the selected GM window.",
    icon: "fa-solid fa-gears",
    type: AuthorityPanel,
    restricted: true,
  });
  Hooks.on("holAuthorityReady", ({ resumedRequest }) => {
    if (resumedRequest)
      retryCharacterRequest(resumedRequest).catch((e) =>
        ui.notifications.error(e.message),
      );
  });
}
