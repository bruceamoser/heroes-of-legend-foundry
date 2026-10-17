import assert from "node:assert/strict";
import test from "node:test";
import { validateModuleLinks } from "../scripts/validate-module-links.mjs";

test("source ESM links resolve without missing exports or local cycles", async () => {
  const result = await validateModuleLinks();
  assert.ok(result.modules > 0);
  assert.ok(result.dependencies >= result.modules - 1);
});
