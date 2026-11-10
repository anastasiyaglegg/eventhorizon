import { test } from "node:test";
import assert from "node:assert/strict";
import { chooseRecoveryTask, clearRecoveryTaskDecisions, recoveryTaskDecisionKey } from "../src/lib/recovery-review";

test("Recovery task decisions are local per suggestion and can be changed", () => {
  const firstKey = recoveryTaskDecisionKey("run-1", 0);
  const secondKey = recoveryTaskDecisionKey("run-1", 1);
  const initial = {};
  const kept = chooseRecoveryTask(initial, firstKey, "kept");
  const both = chooseRecoveryTask(kept, secondKey, "dismissed");
  const changed = chooseRecoveryTask(both, firstKey, "dismissed");
  const cleared = clearRecoveryTaskDecisions();

  assert.deepEqual(initial, {});
  assert.deepEqual(kept, { [firstKey]: "kept" });
  assert.deepEqual(changed, { [firstKey]: "dismissed", [secondKey]: "dismissed" });
  assert.deepEqual(cleared, {});
  assert.notEqual(recoveryTaskDecisionKey("run-2", 0), firstKey);
});
