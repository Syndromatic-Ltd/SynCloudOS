/**
 * Canonical comparison and storage key for an application's bundle identifier.
 * Keep the authored identifier on app records; only keys are case-folded.
 * Bundle identifiers contain ASCII letters, digits, hyphens and dots, so this
 * comparison is deterministic and independent of the user's locale.
 *
 * @template {string | null | undefined} T
 * @param {T} bundleIdentifier
 * @returns {T}
 */
export function normalizeBundleIdentifier(bundleIdentifier) {
  return typeof bundleIdentifier === "string" ? bundleIdentifier.toLowerCase() : bundleIdentifier;
}
