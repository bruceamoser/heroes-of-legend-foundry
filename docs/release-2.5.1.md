# Heroes of Legend 2.5.1

## Fix: Return to creature on unlinked tokens

- The summon profile flag now persists on the TokenDocument for unlinked tokens
  instead of the transient synthetic Actor.
- The sheet reads token-level summon flags and re-renders the current token
  Actor sheet, so **Return to creature** visibly restores the standard creature
  view.
- Returning clears both the token flag and any inherited base-Actor summon flag.
- Missing profiles and permission failures now surface a notification instead of
  failing silently.
- Base-Actor behavior is unchanged.

## Verification

- `npm run check`: **707/707**.
- Token-only smoke: standard Adder token, **Use as summon**, profile persisted
  on the TokenDocument, attacker sheet shown, **Return to creature** restored the
  standard sheet. Base-Actor set/return also passed.
