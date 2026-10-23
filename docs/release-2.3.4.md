# Heroes of Legend 2.3.4

- Apply Damage uses the fixed damage and named conditions in the evaluated roll,
  including fixed clauses followed by separate table-resolved effects. Invitation
  to the Blade no longer opens a blank damage dialog for its Standard or Strong
  outcome. Its conditional next-defense Boon remains a visible table reminder.
- Creature resistance and weakness labels normalize through the shared damage-type
  constants. Basilisk and Skeleton Sentry printed Physical resistance no longer
  causes an unknown-type error. Printed source wording is preserved.
- Legacy abilities missing a catalog-ID flag can resolve exact source provenance
  for their roll metadata. Existing custom attributes and outcomes remain intact;
  invalid explicit IDs and mismatched source hashes are not guessed from names.
- Damage continues to apply to selected owned tokens. Fixed roll outcomes need no
  extra dialog. Variable or ambiguous outcomes retain explicit table adjudication.
- Audit all 213 damage-dealing ability tiers across the complete catalog. Resolve
  fixed mixed types, area wording and conditions after movement clauses. Fire/cold
  and fire/lightning choices occur in the original roll dialog and are saved with
  the result. Evaluated roll cards no longer fall back to a manual damage dialog.
- Prominent roll-card Damage and Conditions summary; Applied status reports the
  actual successful damage/condition updates after Apply Damage.
