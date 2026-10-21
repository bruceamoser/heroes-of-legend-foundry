import {currentHpInput} from "../rules/resource-input.mjs";
export function hpInputValue(value, maximum, current = null) {
  return currentHpInput(String(value),maximum,current);
}
