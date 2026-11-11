import assert from "node:assert/strict";
import test from "node:test";
import { SaveRevision } from "../src/lib/save-revision";

test("edits made while a save is pending remain unsaved after its response", () => {
  const revisions = new SaveRevision();
  revisions.edit();
  const sent = revisions.snapshot();
  revisions.edit();
  assert.equal(revisions.changedSince(sent), true);
  const nextSave = revisions.snapshot();
  assert.equal(revisions.changedSince(nextSave), false);
});
