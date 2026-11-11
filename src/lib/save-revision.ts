/** Tracks edits made after a save request captured its plan. */
export class SaveRevision {
  private revision = 0;

  edit() { this.revision += 1; }
  snapshot() { return this.revision; }
  changedSince(snapshot: number) { return this.revision !== snapshot; }
  reset() { this.revision = 0; }
}
