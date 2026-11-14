/* SynCloudOS — Copyright © 2026 Syndromatic Ltd. AGPL-3.0-or-later. */

import type { SynCloudOSLaunchHistoryOptions, SynCloudOSOpenAppOptions } from "./launchTypes";

export function toHistoryOptions(options: SynCloudOSOpenAppOptions): SynCloudOSLaunchHistoryOptions {
  return {
    source: options.source,
    focus: options.focus,
    syncRoute: options.syncRoute,
    queue: options.queue,
    deferUntilAuthorised: options.deferUntilAuthorised,
    hold: options.hold,
    reason: options.reason,
    context: options.context ? { ...options.context } : undefined
  };
}
