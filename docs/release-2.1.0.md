# Heroes of Legend 2.1.0 — explicit actions

This release changes the play model following Bruce’s October 20 direction (#232).
Players decide when to apply consequences. The system calculates and records the
button they pressed, and offers ordinary correction controls.

- Ability, attack, defense and death rolls post results without applying damage,
  wounds or death changes. Rolling does not require an encounter or a connected GM.
- Apply Damage uses selected tokens, not targets or an inferred character. Linked
  tokens sharing an Actor update that Actor once; unlinked token Actors update
  separately. Each Actor’s resistance applies. A later deliberate click applies
  again; edit HP to correct a mistake. Ownership remains required.
- Fixed damage can apply directly. Variable or conditional damage offers an editable
  amount/type dialog so the table chooses the applicable result.
- Ability use spends its action on the Actor’s counters. Sheets and encounter tools
  share those counters; Reset actions clears them. Counters record uses without
  prohibiting table-approved exceptions. Reset also clears manually activated defense
  benefits; their Remove buttons can clear them individually.
- Add Wound rolls and applies its selected type. Remove Wound removes only that wound
  and its effects, preserving later wounds and HP edits. The existing immediate Undo
  remains available when its before/after state is still intact.
- Creation, advancement, inventory, equipment, conditions and recovery use owned
  document permissions directly. The old global coordinator and its settings panel
  no longer gate gameplay. Shared encounter changes and other-owner potion writes
  still require a connected GM to relay permitted requests.
- Turn selection/finish update the encounter tracker without triggering condition
  damage, death procedures or automatic effect chains. Those consequences are handled
  through explicit controls and table adjudication.
- Chat emphasizes compact bold labels, result and primary buttons. Audit/rules details
  and correction guidance are collapsed; multi-target damage uses aligned columns.

Spell costs and specialty consequences remain printed rules for explicit table
application; a roll does not silently deduct HP or infer unique effects. This changes
interaction policy, not the canonical rules. Existing world content is not rebuilt.
