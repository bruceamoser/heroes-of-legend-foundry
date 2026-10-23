# Heroes of Legend 2.3.5

- Summons use the same creature sheet class, template and compact combat layout.
  Existing explicit SummonSheet selections inherit the same implementation.
  HP, portrait, attributes, action tables, notes and edit controls use the shared
  flow. Printed attacker/defender outcome orientation is preserved.
- Summon attack buttons open the shared attack roll and damage-result flow;
  they do not invent command, lifecycle or independent-turn automation.
- Native Actor Import Data recognizes workshop character JSON, validates it
  against current rules and imports the complete character, inventory and play
  state. Destination identity/ownership are retained. Raw native Actor JSON still
  uses Foundry's existing import path.
- Creature, summon, ability and equipment rule links resolve through the local
  rules library rather than opening GitHub for a rules reference.
