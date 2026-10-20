import { updateOwnedDocument } from "../services/documents.mjs";

/** Use Foundry's native viewer without changing or sharing the Actor image. */
export function viewPortrait() {
  if (!this.actor.testUserPermission(game.user, "OBSERVER"))
    throw new Error("You cannot view this Actor's portrait.");
  return new foundry.applications.apps.ImagePopout({
    src: this.actor.img,
    uuid: this.actor.uuid,
    window: { title: this.actor.name },
  }).render({ force: true });
}

/**
 * The inherited DocumentSheetV2 editImage action supplies the native FilePicker.
 * Save only its IMG result, leaving unrelated form edits and live resources alone.
 */
export async function savePortrait() {
  if (!this.isEditable || !this.actor.testUserPermission(game.user, "OWNER"))
    throw new Error("Only this Actor's owner can change its portrait.");
  const image = this.element.querySelector('[data-portrait-image][data-edit="img"]');
  const img = image?.getAttribute("src");
  if (!img) throw new Error("Choose a portrait image first.");
  if (img === this.actor.img) return this.actor;
  return updateOwnedDocument(this.actor, { img });
}

/** IMG is required by Foundry's editImage action; supply equivalent keyboard activation. */
export function bindPortraitControls(app) {
  for (const image of app.element.querySelectorAll("[data-portrait-image]")) {
    if (image.dataset.portraitBound) continue;
    image.dataset.portraitBound = "true";
    image.addEventListener("keydown", (event) => {
      if (!["Enter", " "].includes(event.key)) return;
      event.preventDefault();
      image.click();
    });
  }
}

/** The standard native image browser persists its selection immediately. */
export async function editPortrait() {
  if (!this.isEditable || !this.actor.testUserPermission(game.user,"OWNER")) throw new Error("Only this Actor's owner can change its portrait.");
  const actor=this.actor;
  const picker=new CONFIG.ux.FilePicker({type:"image",current:actor.img,document:actor,callback:async img=>{
    try {if (typeof img !== "string" || !img.trim()) throw new Error("Choose a portrait image.");await updateOwnedDocument(actor,{img});}
    catch(error) {ui.notifications.error(error.message);}
  }});
  return picker.browse();
}
