/** Use Foundry's native viewer without changing or sharing the Actor image. */
export function viewPortrait() {
  return new foundry.applications.apps.ImagePopout({
    src: this.actor.img,
    uuid: this.actor.uuid,
    window: { title: this.actor.name },
  }).render({ force: true });
}
