/** Preserve submitted numbers so invalid input fails validation instead of being rounded or clamped. */
export class StrictNumberField extends foundry.data.fields.NumberField {
  _cleanType(value) { return value; }
}
