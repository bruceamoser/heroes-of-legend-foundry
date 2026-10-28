# Summon profiles

`static/data/summons.json` holds 73 pinned summon profiles. Each profile keeps the
complete source Markdown, eligibility, attributes, HP, movement, printed defense,
mitigations, attacker-oriented action rows and command/healing restrictions.

A summon is a standard `creature` Actor with a
`flags.heroes-of-legend.summon` profile. There is no separate `summon` Actor type
and no `packs/summons` compendium. A standard creature with
`flags.heroes-of-legend.summoning.eligible` shows **Use as summon** on its sheet;
the toggle projects attacker outcomes, command restrictions and the summon
reference, and **Return to creature** clears the flag. The Actor remains a
creature throughout, so health, damage, token and ownership use the normal
creature paths.

The build ships `data/summons.json` for the sheet toggle but compiles only the
abilities, equipment, creatures, player-rules, DA-rules and wounds packs. Profile
validation remains `npm run validate:summons`; `npm test` covers all 73 profiles,
their source hashes and the shared projection.
