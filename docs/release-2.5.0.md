# Heroes of Legend 2.5.0

## Summons use standard creatures

- Removed the separate `summon` Actor type, `SummonData`, `SummonSheet` and the
  73-Actor `packs/summons` compendium.
- A summon is now a standard `creature` Actor with
  `flags.heroes-of-legend.summon`.
- Eligible creatures show **Use as summon** on the creature sheet. The toggle
  projects the pinned attacker outcomes, command/healing restrictions and source
  reference; **Return to creature** clears the flag. HP, damage, tokens and
  ownership continue through the normal creature paths.
- `static/data/summons.json` remains the pinned profile catalog and ships as
  `data/summons.json` for the sheet toggle. The build compiles abilities,
  equipment, creatures, player-rules, DA-rules and wounds packs only.
- The authored content tree is now 656 files instead of 729.
- Legacy summon Actors are not migrated. This release assumes no live world
  contains them; recreate any existing test summon from its standard creature.

## Verification

- `npm test`: **706/706**.
- `npm run check`: build, validate and tests.
- Foundry 14.367 smoke: imported the standard Adder, used **Use as summon**,
  verified attacker outcomes, HP maximum and profile flag, then cleared it with
  **Return to creature** and no page errors.
