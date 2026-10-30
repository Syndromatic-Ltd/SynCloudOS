// Internal presentation evidence attached to canonical one-shot acceptances.
// Keep this out of public barrels and detached app-visible command data.
const hiddenAcceptances = new WeakSet<object>();

export function markHiddenCommandAcceptance(acceptance: object): void {
  hiddenAcceptances.add(acceptance);
}

export function isHiddenCommandAcceptance(acceptance: object): boolean {
  return hiddenAcceptances.has(acceptance);
}
