import { resolveSurvivalRequest } from "../services/survival.mjs";
import { cancelTurnPhase } from "../services/turn-phase.mjs";
import { resolveWoundRequest } from "../services/wounds.mjs";
import { resolveRecoveryRequest } from "../services/recovery.mjs";
import { resolveDamageRequest } from "../services/damage.mjs";
import { resolveEquipmentRequest } from "../services/equipment.mjs";
import {
  findInventoryActor,
  inventoryActorTargets,
  resolveInventoryRequest,
} from "../services/inventory.mjs";
import { InventoryPanel } from "./inventory.mjs";
import {
  resolveDefenseRequest,
  abandonDefense,
  defenseResponses,
} from "../services/defense-responses.mjs";
import { resolveNpcAttack } from "../services/npc-attacks.mjs";
import { resolveAbilityRequest } from "../services/abilities.mjs";
import {
  acknowledgeMissingPlayerBasicMeleePresentation,
  pendingPlayerAttacks,
  recoverPlayerBasicMeleeRequest,
  resolvePlayerBasicMeleeRequest,
} from "../services/player-attacks.mjs";
import { pendingAbilityIsPlayerAttack } from "../rules/player-attacks.mjs";
import { resolveConditionRequest } from "../services/conditions.mjs";
import { resolveCombatRequest } from "../services/combat.mjs";
import {
  findPotionCombat,
  potionOperationHosts,
  recoverPotionSupplyOperation,
  reconcilePotionOperation,
  resolvePotionRequest,
} from "../services/potions.mjs";
import {
  bindCreationAuthority,
  isCreationAuthority,
  releaseAuthority,
} from "../services/authority.mjs";
import { resolveCreationRequest } from "../services/creation.mjs";
import { resolveDevelopmentRequest } from "../services/advancement.mjs";
const ID = "heroes-of-legend";
const syncDocument = (uuid) =>
  typeof uuid === "string" && uuid ? fromUuidSync(uuid) : null;
export async function retryCharacterRequest(id) {
  const message = game.messages.get(id);
  if (!message) {
    const work = game.settings.get(ID, "authorityWork"),
      candidate =
        work.requestId === id && typeof work.targetUuid === "string"
          ? await fromUuid(work.targetUuid)
          : null,
      actor =
        (candidate?.documentName === "Actor" &&
        (candidate.getFlag(ID, "pendingInventory")?.requestId === id ||
          candidate.getFlag(ID, "inventoryResults")?.[id] ||
          candidate.getFlag(ID, "operationReceipts")?.[id]?.kind ===
            "inventory")
          ? candidate
          : null) ?? findInventoryActor(id);
    if (actor) return resolveInventoryRequest(id, actor.uuid);
    const potionCombat = findPotionCombat(id);
    if (potionCombat) return resolvePotionRequest(id, potionCombat.uuid);
  }
  if (message?.getFlag(ID, "potionRequest"))
    return resolvePotionRequest(id);
  if (message?.getFlag(ID, "survivalRequest"))
    return resolveSurvivalRequest(id);
  if (message?.getFlag(ID, "woundRequest")) return resolveWoundRequest(id);
  if (message?.getFlag(ID, "recoveryRequest"))
    return resolveRecoveryRequest(id);
  if (message?.getFlag(ID, "damageRequest")) return resolveDamageRequest(id);
  if (message?.getFlag(ID, "equipmentRequest"))
    return resolveEquipmentRequest(id);
  if (message?.getFlag(ID, "inventoryRequest"))
    return resolveInventoryRequest(id);
  if (message?.getFlag(ID, "creationRequest"))
    return resolveCreationRequest(id);
  if (message?.getFlag(ID, "developmentRequest"))
    return resolveDevelopmentRequest(id);
  if (message?.getFlag(ID, "combatRequest")) return resolveCombatRequest(id);
  if (message?.getFlag(ID, "conditionRequest"))
    return resolveConditionRequest(id);
  if (message?.getFlag(ID, "abilityRequest")) return resolveAbilityRequest(id);
  if (message?.getFlag(ID, "npcAttackRequest")) return resolveNpcAttack(id);
  if (message?.getFlag(ID, "playerAttackRequest"))
    return resolvePlayerBasicMeleeRequest(id);
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
      resumeTurn: AuthorityPanel.resumeTurn,
      cancelTurn: AuthorityPanel.cancelTurn,
      activate: AuthorityPanel.activate,
      release: AuthorityPanel.release,
      retry: AuthorityPanel.retry,
      resumeAbility: AuthorityPanel.resumeAbility,
      resumePotion: AuthorityPanel.resumePotion,
      recoverPotion: AuthorityPanel.recoverPotion,
      reconcilePotion: AuthorityPanel.reconcilePotion,
      resumeAttack: AuthorityPanel.resumeAttack,
      recoverAttack: AuthorityPanel.recoverAttack,
      acknowledgeMissingAttack: AuthorityPanel.acknowledgeMissingAttack,
      openAttackDamage: AuthorityPanel.openAttackDamage,
      abandonDefense: AuthorityPanel.abandonDefense,
      openInventory: AuthorityPanel.openInventory,
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
        .filter((combat) => {
          const pending = combat.getFlag(ID, "pendingAbility");
          return (
            pending &&
            !pendingAbilityIsPlayerAttack(
              pending,
              combat.getFlag(ID, "playerAttackOperations"),
            )
          );
        })
        .map((c) => ({
          combatUuid: c.uuid,
          id: c.getFlag(ID, "pendingAbility"),
          name: c.name ?? c.id,
        })),
      pendingAttacks: game.combats.contents.flatMap((combat) =>
        pendingPlayerAttacks(combat).map((id) => {
          const operation = combat.getFlag(
              ID,
              "playerAttackOperations",
            )?.[id],
            receipt = combat.getFlag(ID, "operationReceipts")?.[id],
            sourceAvailable = Boolean(game.messages.get(id)),
            acknowledged = Boolean(
              receipt?.presentationAcknowledgement,
            );
          return {
            combatUuid: combat.uuid,
            id,
            name: combat.name ?? combat.id,
            attacker: operation?.attackerName ?? "Unknown attacker",
            target: operation?.targetName ?? "Unknown target",
            saved: Boolean(operation?.result),
            sourceAvailable,
            status: operation?.status ?? "unknown",
            recoverable:
              !operation?.result &&
              ["declared", "resolving"].includes(operation?.status),
            acknowledged,
            reconcileAvailable:
              !sourceAvailable &&
              Boolean(operation?.result) &&
              receipt?.applied !== true,
            canAcknowledge:
              !sourceAvailable &&
              Boolean(operation?.result) &&
              receipt?.applied === true &&
              receipt?.presentation === "missing" &&
              !acknowledged,
            damageAvailable:
              Boolean(operation?.result) && receipt?.applied === true,
          };
        }),
      ),
      pendingTurns: game.combats
        .filter((c) => c.getFlag(ID, "pendingTurnPhase"))
        .map((c) => ({
          combatUuid: c.uuid,
          id: c.getFlag(ID, "pendingTurnPhase").requestId,
          name: c.name ?? c.id,
        })),
      pendingInventories: inventoryActorTargets()
        .filter((actor) => actor.getFlag(ID, "pendingInventory"))
        .map((actor) => {
          const pending = actor.getFlag(ID, "pendingInventory");
          return {
            actorUuid: actor.uuid,
            actorName: actor.name,
            requestId: pending.requestId,
            itemId: pending.target.itemId,
            itemName: pending.target.name,
            phase:
              pending.phase === "result"
                ? "saved result"
                : "waiting for the DA",
          };
        }),
      pendingPotions: potionOperationHosts()
        .filter((combat) => combat.getFlag(ID, "pendingPotion"))
        .map((combat) => {
          const requestId = combat.getFlag(ID, "pendingPotion"),
            operation = combat.getFlag(ID, "potionOperations")?.[requestId],
            giver = syncDocument(operation?.giver?.actorUuid),
            supply = giver?.getFlag(ID, "potionSupplyOperations")?.[
              operation?.supplyOperationId
            ];
          return {
            combatUuid: combat.uuid,
            requestId,
            giver: giver?.name ?? "Unknown giver",
            recipient:
              syncDocument(operation?.recipient?.actorUuid)?.name ??
              "Unknown recipient",
            phase:
              operation?.status === "needs-reconciliation"
                ? "source reconciliation"
                : supply?.phase === "rolling"
                  ? "unknown supply dice"
                  : operation?.status ?? "reserved",
            needsRecovery: supply?.phase === "rolling",
            needsReconciliation:
              operation?.status === "needs-reconciliation",
          };
        }),
      requests: game.messages
        .filter(
          (m) =>
            m.getFlag(ID, "creationRequest") ||
            m.getFlag(ID, "developmentRequest") ||
            m.getFlag(ID, "combatRequest") ||
            m.getFlag(ID, "conditionRequest") ||
            m.getFlag(ID, "equipmentRequest") ||
            m.getFlag(ID, "inventoryRequest") ||
            m.getFlag(ID, "potionRequest") ||
            m.getFlag(ID, "damageRequest") ||
            m.getFlag(ID, "recoveryRequest") ||
            m.getFlag(ID, "woundRequest") ||
            m.getFlag(ID, "survivalRequest") ||
            m.getFlag(ID, "abilityRequest") ||
            m.getFlag(ID, "npcAttackRequest") ||
            m.getFlag(ID, "playerAttackRequest") ||
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
              (m.getFlag(ID, "survivalRequest")
                ? "Survival"
                : m.getFlag(ID, "woundRequest")
                  ? "Wound"
                  : m.getFlag(ID, "recoveryRequest")
                    ? "Recovery"
                    : m.getFlag(ID, "damageRequest")
                      ? "Damage"
                      : m.getFlag(ID, "equipmentRequest")
                        ? "Equipment"
                        : m.getFlag(ID, "inventoryRequest")
                          ? "Inventory"
                          : m.getFlag(ID, "potionRequest")
                            ? "Healing potion"
                          : m.getFlag(ID, "npcAttackRequest")
                            ? "NPC attack"
                            : m.getFlag(ID, "defenseRequest")
                              ? "Defense"
                              : m.getFlag(ID, "playerAttackRequest")
                                ? "Player attack"
                                : "Ability")),
        })),
    };
  }
  static async resumeTurn(event, target) {
    try {
      await resolveCombatRequest(target.dataset.id, target.dataset.combat);
      await this.render();
    } catch (e) {
      ui.notifications.error(e.message);
    }
  }
  static async cancelTurn(event, target) {
    try {
      const result = await foundry.applications.api.DialogV2.input({classes: ["heroes-of-legend", "hol-native-dialog"],
        window: { title: "Cancel unapplied turn change" },
        content: '<label>Note (optional)<input name="reason"></label>',
        ok: { label: "Record cancellation" },
      });
      if (result) await cancelTurnPhase(target.dataset.combat, result.reason);
      await this.render();
    } catch (e) {
      ui.notifications.error(e.message);
    }
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
      const choice = await foundry.applications.api.DialogV2.input({classes: ["heroes-of-legend", "hol-native-dialog"],
        window: { title: "Abandon unresolved defense" },
        content:
          '<p>No saved roll may exist. This preserves the attempt without rerolling. An optional note can record table context.</p><label>Note (optional)<input name="reason"></label>',
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
  static async openInventory(event, target) {
    try {
      const actor = await fromUuid(target.dataset.actor);
      if (!actor)
        throw new Error("The character for this supply check is unavailable.");
      await new InventoryPanel(actor, target.dataset.item).render({
        force: true,
      });
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
  static async resumeAttack(event, target) {
    try {
      if (!isCreationAuthority())
        throw new Error("Enable this coordinator first.");
      await resolvePlayerBasicMeleeRequest(target.dataset.id);
      await this.render();
    } catch (error) {
      ui.notifications.error(error.message);
    }
  }
  static async recoverAttack(event, target) {
    try {
      if (!isCreationAuthority())
        throw new Error("Enable this coordinator first.");
      const choice = await foundry.applications.api.DialogV2.input({classes: ["heroes-of-legend", "hol-native-dialog"],
        window: { title: "Recover retained Basic Melee dice" },
        content:
          '<p>Do not roll again. Enter the three dice retained after Boons/Banes.</p><label>Retained d6 faces<input name="retained" required placeholder="Example: 3 5 6"></label><label>Note (optional)<input name="reason"></label>',
        ok: { label: "Record retained result" },
      });
      if (!choice) return;
      const retained = String(choice.retained)
        .trim()
        .split(/\s+/)
        .map(Number);
      await recoverPlayerBasicMeleeRequest(target.dataset.id, {
        retained,
        reason: choice.reason,
      });
      await this.render();
    } catch (error) {
      ui.notifications.error(error.message);
    }
  }
  static async acknowledgeMissingAttack(event, target) {
    try {
      if (!isCreationAuthority())
        throw new Error("Enable this coordinator first.");
      const choice = await foundry.applications.api.DialogV2.input({classes: ["heroes-of-legend", "hol-native-dialog"],
        window: { title: "Acknowledge missing Basic Melee presentation" },
        content:
          '<p>This records the missing presentation in the durable receipt and clears this attack’s pending action reservation. It preserves the authoritative result and does not recreate the message or roll again.</p><label>Note (optional)<input name="reason"></label>',
        ok: { label: "Acknowledge and continue" },
      });
      if (!choice) return;
      await acknowledgeMissingPlayerBasicMeleePresentation(
        target.dataset.id,
        { reason: choice.reason },
      );
      await this.render();
    } catch (error) {
      ui.notifications.error(error.message);
    }
  }
  static async openAttackDamage(event, target) {
    try {
      const { openPlayerAttackDamage } = await import("./damage.mjs");
      await openPlayerAttackDamage(target.dataset.id);
    } catch (error) {
      ui.notifications.error(error.message);
    }
  }
  static async resumePotion(event, target) {
    try {
      if (!isCreationAuthority())
        throw new Error("Enable this coordinator first.");
      await resolvePotionRequest(target.dataset.id, target.dataset.combat);
      await this.render();
    } catch (error) {
      ui.notifications.error(error.message);
    }
  }
  static async recoverPotion(event, target) {
    try {
      if (!isCreationAuthority())
        throw new Error("Enable this coordinator first.");
      const combat = await fromUuid(target.dataset.combat),
        requestId = target.dataset.id,
        operation = combat?.getFlag(ID, "potionOperations")?.[requestId],
        giver = await fromUuid(operation?.giver?.actorUuid ?? ""),
        child = giver?.getFlag(ID, "potionSupplyOperations")?.[
          operation?.supplyOperationId
        ];
      if (!child || child.phase !== "rolling")
        throw new Error("This potion supply check has no unknown dice.");
      const result = await foundry.applications.api.DialogV2.input({classes: ["heroes-of-legend", "hol-native-dialog"],
        window: { title: "Recover observed potion supply face" },
        content: `<p>The dice may have rolled without a saved result. Enter the face that was seen; no new roll will occur.</p><label>Observed d${child.target.inventoryDie} face<input name="retainedFace" type="number" min="1" max="${child.target.inventoryDie}" step="1" required></label><label>Optional note<input name="reason"></label>`,
        ok: { label: "Record observed face" },
      });
      if (!result) return;
      await recoverPotionSupplyOperation(
        requestId,
        Number(result.retainedFace),
        result.reason,
      );
      await this.render();
    } catch (error) {
      ui.notifications.error(error.message);
    }
  }
  static async reconcilePotion(event, target) {
    try {
      if (!isCreationAuthority())
        throw new Error("Enable this coordinator first.");
      const combat = await fromUuid(target.dataset.combat),
        operation = combat?.getFlag(ID, "potionOperations")?.[
          target.dataset.id
        ];
      if (operation?.status !== "needs-reconciliation")
        throw new Error("This potion operation does not need reconciliation.");
      const choices = operation.reconciliation?.choices ?? [],
        labels = {
          "charge-current": "Charge the exact current bottle after review",
          "waive-supply": "Close without changing supply",
          "cancel-remaining": "Cancel the remaining potion use",
        },
        options = choices
          .map(
            (choice) =>
              `<option value="${choice}">${labels[choice] ?? choice}</option>`,
          )
          .join("");
      const result = await foundry.applications.api.DialogV2.input({classes: ["heroes-of-legend", "hol-native-dialog"],
        window: { title: "Reconcile changed potion source" },
        content:
          `<p>Healing may already be applied. Choose only from the reconciliation options retained by this operation.</p><label>Disposition<select name="choice">${options}</select></label><label>Optional note<input name="reason"></label>`,
        ok: { label: "Record reconciliation" },
      });
      if (!result) return;
      await reconcilePotionOperation(
        target.dataset.id,
        result.choice,
        result.reason,
      );
      await this.render();
    } catch (error) {
      ui.notifications.error(error.message);
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
