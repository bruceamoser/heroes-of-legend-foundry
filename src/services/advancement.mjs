import { createActionMessage, shouldProcessRequest } from "./authority.mjs";
import { editCharacterLanguage } from "../rules/character-languages.mjs";
import { getCampaignLanguageConfiguration } from "./languages.mjs";
import { writeCharacterActor, ensureAuthorityReady } from "./authority.mjs";
import {
  enqueueCharacterOperation,
  isCreationAuthority,
  buildCharacterItems,
  validateCreationChanges,
} from "./creation.mjs";
import { loadCatalogs } from "./catalog.mjs";
import { changeCharacterLevel, refundLearnedAbility } from "../rules/development.mjs";
import { advancementPreview, signatureChoicePreview } from "../rules/advancement.mjs";
const ID = "heroes-of-legend";
export function registerAdvancement() {
  Hooks.on("createChatMessage", (message) => {
    if (message.getFlag(ID, "developmentRequest") && shouldProcessRequest(message))
      resolveDevelopmentRequest(message.id).catch(async (error) => {
        ui.notifications.error(error.message);
        await message.update({
          content: `Development needs attention: ${foundry.utils.escapeHTML(error.message)}`,
          [`flags.${ID}.developmentFailure`]: error.message,
        });
      });
  });
}
export function currentDevelopment(actor) {
  const state = structuredClone(actor.getFlag(ID, "development"));
  if (!state) throw new Error("Complete character creation first.");
  state.languages ??= structuredClone(state.creationSummary?.languages ?? []);
  state.gritGranted = actor.system.grit.granted;
  state.gritSpent = actor.system.grit.spent;
  state.items = actor.items
    .filter((i) => i.type === "equipment")
    .map((i) => ({
      instanceId: i.id,
      catalogId: i.system.catalogId,
      quantity: i.system.quantity,
      hands: i.system.hands,
      inventoryDie: i.system.inventoryDie,
    }));
  return state;
}
export async function requestDevelopment(actor, kind, payload = {}) {
  if (!actor.isOwner) throw new Error("You must own this character.");
  await ensureAuthorityReady();
  return createActionMessage({
    content: "Character development requested.",
    whisper: game.users
      .filter((u) => u.isGM || u.id === game.user.id)
      .map((u) => u.id),
    flags: {
      [ID]: { developmentRequest: { actorUuid: actor.uuid, kind, ...payload } },
    },
  });
}
export async function waitForDevelopment(actor, requestId, draftId, { timeout = 30000, interval = 100 } = {}) {
  const start = Date.now();
  while (true) {
    const receipt = actor.getFlag(ID, "development")?.commitReceipts?.[draftId];
    if (receipt?.status === "complete") return receipt;
    const failure = game.messages.get(requestId)?.getFlag(ID, "developmentFailure");
    if (failure) throw new Error(failure);
    if (Date.now() - start >= timeout) throw new Error("Development has not completed. Your choices are saved; retry Save to apply your saved choices.");
    await new Promise(resolve => setTimeout(resolve, interval));
  }
}
export async function waitForDevelopmentOperation(actor, requestId, {timeout=30000, interval=100}={}) {
  const start=Date.now();
  while (true) {
    const receipt=actor.getFlag(ID,"operationReceipts")?.[requestId];
    if(receipt?.applied) return receipt;
    const message=game.messages.get(requestId);
    const failure=message?.getFlag(ID,"developmentFailure");
    if(failure) throw new Error(failure);
    const result=message?.getFlag(ID,"developmentResult");
    if(result?.complete) return result;
    if(Date.now()-start>=timeout) throw new Error("Development has not completed. Retry the action from this window.");
    await new Promise(resolve=>setTimeout(resolve,interval));
  }
}
export function resolveDevelopmentRequest(id) {
  return enqueueCharacterOperation(() => apply(id), { requestId: id });
}
async function apply(id) {
  if (!isCreationAuthority()) return { status: "not-authority" };
  const message = game.messages.get(id),
    request = message?.getFlag(ID, "developmentRequest");
  const actor =
    typeof request?.actorUuid === "string"
      ? await fromUuid(request.actorUuid)
      : null;
  if (
    actor?.type !== "character" ||
    actor.pack ||
    !message.author ||
    !actor.testUserPermission(message.author, "OWNER")
  )
    throw new Error("Unauthorized character development request.");
  const priorOperation=actor.getFlag(ID,"operationReceipts")?.[message.id];
  if(priorOperation?.kind==="refundAbility") {
    if(priorOperation.authorId!==message.author.id || priorOperation.request!==JSON.stringify(request))throw new Error("The saved refund request changed.");
    if(!priorOperation.applied)await finishAbilityRefund(actor,message.id,priorOperation);
    await message.update({content:`${foundry.utils.escapeHTML(actor.name)} · Ability removed · ${currentDevelopment(actor).dp} DP`});
    return {status:"complete",replay:true};
  }
  if (priorOperation?.kind === "chooseSignature") {
    if(priorOperation.authorId!==message.author.id || priorOperation.request!==JSON.stringify(request))throw new Error("The saved signature request changed.");
    if(!priorOperation.applied)await finishSignatureChoice(actor,id,priorOperation);
    await message.update({content:"Character signature saved.",[`flags.${ID}.-=developmentFailure`]:null});
    return {status:"complete",replay:true};
  }
  if (priorOperation?.applied) return {status:"complete",replay:true};
  const current = currentDevelopment(actor),
    changes = {};
  let state,
    createdIds = [], refundItemIds = [], signatureDeletes = [];
  if (request.kind === "editLanguage") {
    if (request.revision !== (current.revision ?? 0)) throw new Error("Character languages or development changed. Review and retry.");
    state = editCharacterLanguage(current,request);
  } else if (["addLevel", "removeLevel", "award"].includes(request.kind)) {
    if (request.revision !== undefined && request.revision !== (current.revision??0)) throw new Error("Development changed. Review and retry.");
    const direction=request.kind==="removeLevel"?-1:1;
    const result=changeCharacterLevel(current,direction);state=result.state;
    state.ledger=[...(current.ledger??[]),{kind:direction>0?"add-level":"remove-level",level:state.level,delta:result.delta,balance:state.dp,operationId:message.id}];
  } else if (request.kind === "refundAbility") {
    const catalogs=await loadCatalogs(),choice=catalogs.choices.find(choice=>choice.id===request.abilityId&&choice.kind==="ability");
    if(!choice)throw new Error("Choose a learned ability.");
    state=refundLearnedAbility(current,request.abilityId);
    if(!state.abilities.includes(request.abilityId))refundItemIds=actor.items.filter(item=>item.type==="ability"&&item.getFlag(ID,"catalogId")===request.abilityId).map(item=>item.id);
    if(request.abilityId==="ability-conditioned-body") {changes["system.health.baseMax"]=Math.max(1,actor.system.health.baseMax-1);changes["system.health.value"]=Math.min(actor.system.health.value,Math.max(1,actor.system.health.max-1));}
    if(request.abilityId==="ability-one-more-dawn") changes["system.grit.granted"]=Math.max(actor.system.grit.spent,actor.system.grit.granted-1);
  } else if (request.kind === "chooseSignature") {
    if(request.revision !== (current.revision ?? 0))throw new Error("Your character changed. Refresh the signature choices before saving.");
    const catalogs=await loadCatalogs(), configuration=getCampaignLanguageConfiguration();
    if(request.sourceCommit!==catalogs.commit || request.languageBasis!==configuration.basis)throw new Error("The character choices changed. Refresh before saving this signature.");
    const preview=signatureChoicePreview(current,{level:request.level,id:request.signatureId,previousId:request.previousId,selection:request.selection},catalogs.choices,catalogs.inventory,configuration.definitions);
    if(!preview.valid)throw new Error("Choose a valid class signature and complete its required choices.");
    state=preview.state;
    const newInventory=state.items.filter(item=>!current.items.some(old=>old.instanceId===item.instanceId));
    const plan=buildCharacterItems(actor,state.abilities,newInventory,catalogs);
    changes.items=plan.items;createdIds=plan.createdIds;
    const removed=new Set(preview.signature?.removeAbilityIds??[]);
    signatureDeletes=actor.items.filter(item=>item.type==="ability"&&removed.has(item.getFlag(ID,"catalogId"))).map(item=>({id:item.id,catalogId:item.getFlag(ID,"catalogId")}));
    state.ledger=[...(current.ledger??[]),...preview.ledger.map(entry=>({...entry,operationId:message.id}))];
  } else if (request.kind === "commitDraft") {
    if (
      !/^[A-Za-z0-9]{16}$/.test(request.draftId ?? "") ||
      !Number.isSafeInteger(request.revision) ||
      request.revision < 1
    )
      throw new Error("Invalid draft identity.");
    const receipt = current.commitReceipts?.[request.draftId];
    if (receipt) {
      if (receipt.status !== "complete") {
        if (receipt.createdIds.some((id) => !actor.items.has(id)))
          throw new Error(
            "Development needs Item reconciliation; do not repeat grants.",
          );
        await actor.update({
          [`flags.${ID}.development.commitReceipts.${request.draftId}.status`]:
            "complete",
        });
      }
      return { status: "complete", replay: true };
    }
    const draft = actor.getFlag(ID, "advancementDraft");
    if (
      !draft ||
      draft.id !== request.draftId ||
      draft.revision !== request.revision ||
      draft.baseRevision !== (current.revision ?? 0)
    )
      throw new Error(
        "Development changed. Review the current ledger before committing.",
      );
    const catalogs = await loadCatalogs();
    if (draft.sourceCommit !== catalogs.commit)
      throw new Error("Review the current book baseline before committing.");
    const languageConfiguration = getCampaignLanguageConfiguration();
    if (draft.languageBasis !== languageConfiguration.basis)
      throw new Error(
        "Campaign languages changed. Review and save the advancement draft before committing.",
      );
    const preview = advancementPreview(
      current,
      draft.data,
      catalogs.choices,
      catalogs.inventory,
      languageConfiguration.definitions,
    );
    if (!preview.valid)
      throw new Error("The advancement draft has unresolved choices.");
    if (
      getCampaignLanguageConfiguration().basis !== languageConfiguration.basis
    )
      throw new Error(
        "Campaign languages changed during validation. Review and save the draft again.",
      );
    state = preview.state;
    const newInventory = state.items.filter(
      (i) => !current.items.some((old) => old.instanceId === i.instanceId),
    );
    const plan = buildCharacterItems(
      actor,
      state.abilities,
      newInventory,
      catalogs,
    );
    changes.items = plan.items;
    createdIds = plan.createdIds;
    changes["system.health.baseMax"] =
      actor.system.health.baseMax + preview.maximumHpDelta;
    changes["system.grit.granted"] =
      actor.system.grit.granted + preview.gritDelta;
    state.ledger = [
      ...(current.ledger ?? []),
      ...preview.ledger.map((entry) => ({ ...entry, operationId: message.id })),
    ];
    state.commitReceipts = {
      ...(state.commitReceipts ?? {}),
      [draft.id]: {
        status: "pending-verification",
        requestId: message.id,
        revision: draft.revision,
        createdIds,
      },
    };
  } else throw new Error("Unknown development operation.");
  state.revision = (current.revision ?? 0) + 1;
  changes[`flags.${ID}.development`] = state;
  changes[`flags.${ID}.operationReceipts.${message.id}`] = {
    applied: !["refundAbility","chooseSignature"].includes(request.kind),
    kind: request.kind,
    ...(request.kind==="chooseSignature"?{authorId:message.author.id,request:JSON.stringify(request),createdIds,deleteItems:signatureDeletes}:{}),
    ...(request.kind==="refundAbility"?{authorId:message.author.id,request:JSON.stringify(request),stateCommitted:true,deleteItemIds:refundItemIds}:{}),
  };
  validateCreationChanges(actor, changes);
  if (!isCreationAuthority()) return { status: "authority-lost" };
  if (
    (actor.getFlag(ID, "development")?.revision ?? 0) !==
    (current.revision ?? 0)
  )
    throw new Error(
      "Development changed during review. Retry against its current revision.",
    );
  await writeCharacterActor(actor, changes);
  if(request.kind==="refundAbility")await finishAbilityRefund(actor,message.id,changes[`flags.${ID}.operationReceipts.${message.id}`]);
  if(request.kind === "chooseSignature")await finishSignatureChoice(actor,id,changes[`flags.${ID}.operationReceipts.${id}`]);
  if (request.kind === "commitDraft") {
    if (createdIds.some((id) => !actor.items.has(id)))
      throw new Error(
        "Development needs Item reconciliation; do not repeat grants.",
      );
    await actor.update({
      [`flags.${ID}.development.commitReceipts.${request.draftId}.status`]:
        "complete",
    });
  }
  await message.update({content:["addLevel","removeLevel","award"].includes(request.kind)
    ? `${foundry.utils.escapeHTML(actor.name)} · Level ${state.level} · ${state.dp} DP${state.dp<0?" · Overspent":""}`
    : request.kind==="refundAbility"?`${foundry.utils.escapeHTML(actor.name)} · Ability removed · ${state.dp} DP`:"Character development saved."});
  return { status: "complete", replay: false };
}

/** Flag/DP settlement precedes physical item deletion so an interrupted deletion
 * can be retried without crediting DP or removing a later replacement item twice. */
async function finishAbilityRefund(actor,requestId,receipt) {
  if(!receipt.stateCommitted || !Array.isArray(receipt.deleteItemIds))throw new Error("This refund has no saved item-removal plan.");
  const ids=receipt.deleteItemIds.filter(id=>actor.items.has(id));
  if(ids.length)await actor.deleteEmbeddedDocuments("Item",ids);
  if(receipt.deleteItemIds.some(id=>actor.items.has(id)))throw new Error("The refund is saved, but its ability item still needs removal. Retry this refund.");
  await writeCharacterActor(actor,{[`flags.${ID}.operationReceipts.${requestId}.applied`]:true});
}

/** Confirm additions before retiring the superseded free Item. Retries never grant twice. */
async function finishSignatureChoice(actor,requestId,receipt) {
  if(!Array.isArray(receipt.createdIds)||receipt.createdIds.some(itemId=>!actor.items.has(itemId)))throw new Error("Signature needs Item reconciliation; do not repeat its grants.");
  const removable=(receipt.deleteItems??[]).filter(record=>{
    const item=actor.items.get(record.id);
    return item?.type==="ability"&&item.getFlag(ID,"catalogId")===record.catalogId&&!currentDevelopment(actor).abilities.includes(record.catalogId);
  });
  if(removable.length)await actor.deleteEmbeddedDocuments("Item",removable.map(record=>record.id));
  if(removable.some(record=>actor.items.has(record.id)))throw new Error("The signature is saved, but its previous ability still needs removal. Retry Save signature.");
  await writeCharacterActor(actor,{[`flags.${ID}.operationReceipts.${requestId}.applied`]:true});
}
