/** Sheet mutation boundary. Foundry performs schema and server permission validation too. */
export async function updateOwnedDocument(document, data, options = {}) {
  if (!document.testUserPermission(game.user, "OWNER")) throw new Error(game.i18n.localize("HOL.NoPermission"));
  if (!document.id) throw new Error("Save a world document before editing it.");
  return document.update(data, options);
}
