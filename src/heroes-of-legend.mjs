/** Native V14 package entry point. No legacy compatibility layer. */
export const SYSTEM_ID = "heroes-of-legend";

Hooks.once("init", () => {
  console.info(`${SYSTEM_ID} | Initializing package foundation`);
});

Hooks.once("ready", () => {
  if (game.user.isGM) ui.notifications.info(game.i18n.localize("HOL.Preview"));
});
