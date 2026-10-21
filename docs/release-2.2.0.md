# Heroes of Legend 2.2.0 — table controls and clear outcomes

Bruce’s October 21 corrections replace action tracking with table control and
complete the direct attack, inventory and development interactions (#234–#237).

- No action counters or Reset actions on characters, creatures or encounter tools.
  The encounter records a chosen participant; Finish releases the turn for the next
  choice, including the same participant. No side-order or action-budget gates.
- Creature attacks declare with Defend. Fixed mixed outcomes, such as Adder Needle
  bite’s damage and Poisoned, post one Apply Damage action for selected tokens.
  The button applies both damage and conditions. Conditional/custom outcomes offer
  explicit damage and condition fields for the table’s interpretation.
- Rolled non-damage abilities show a compact result dialog and chat outcome. No-roll
  actions show their operative effect and a full-details link. Play cards omit
  automation/provenance/how-to filler. The dying dialog uses compact marks and
  outcomes without the ability browser or Grit guidance block.
- Ranged weapons have ammunition assignments. Missing/depleted ammunition is reported
  before rolling; a completed ranged roll checks its assigned supply once and posts
  character, item, die result and depletion state. Consumable dice use the same direct
  supply action. A 1 reduces the supply die; d4 → 0 is depleted.
- Condition cards name target, condition and rating. No source textbox is required.
  Removed conditions stop contributing and stop showing token icons. Native token
  status controls route into the same HOL condition interface.
- Main Actions and Maneuvers sort attacks first. Favorites are available beside
  ability names in Abilities. Inventory Held/Worn controls follow supported item use.
  Add Equipment is a searchable market list with unavailable purchases disabled.
  Languages use a one-click list. Passive and ancestry sidebar entries are name links.
- Development has direct Add level and Remove level controls, without safe-place
  confirmation. Only level and its canonical DP grant change. Negative DP is allowed,
  visibly flagged as overspent, and paid abilities can be removed for refunds.
  Ability refunds physically delete the embedded Item and survive replay/reload.
- Creature sheets retain Recovery and remove Conditions/Damage/Equipment controls.

Existing world content is preserved. Legacy action-counter flags are ignored rather
than rewritten. Canonical rules and book sources are unchanged.
