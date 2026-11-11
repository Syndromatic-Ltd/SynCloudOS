/** Private kernel proof that replay was refused before admitting any model or
 * resource change. Consume once: returned UndoResult errors are public values
 * and must never authorize a later arbitrary action's failure. */
const refusals = new WeakSet<Error>();

export function refuseUnchangedUndoReplay(cause: unknown): Error {
  // Do not read message/toString after the document's final authority check:
  // an arbitrary thrown value can run user code from either conversion.
  const error = new Error("Document history projection was refused before commitment.", { cause });
  error.name = "UndoReplayRefusedError";
  refusals.add(error);
  return error;
}

export function consumeUndoReplayRefusal(error: unknown): boolean {
  if (!(error instanceof Error) || !refusals.has(error)) return false;
  refusals.delete(error);
  return true;
}
