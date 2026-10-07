/*
 * SynCloudOS
 * Copyright © 2026 Syndromatic Ltd. All rights reserved.
 *
 * Designed by Kavish Krishnakumar in Manchester.
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but with ABSOLUTELY NO WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program. If not, see <http://www.gnu.org/licenses/>.
 */

import { newsIconUrl } from "../SynCloudOS/Resources/frameworkAssets";
import type { SynCloudOSAppInfo, SynCloudOSNotification } from "../SynCloudOS/SynCloudOS";
import { useWebspringLocale } from "./webspringLocale";
import type { WebspringViewProps } from "./webspringTypes";
import "./LowerContentShelfView.css";

export function LowerContentShelfView({
  selectedApp,
  mode,
  notification,
  onOpenNotificationCentre,
  sections = [],
  onOpenContent,
  onRefreshContent,
}: {
  selectedApp: SynCloudOSAppInfo | null;
  mode: "news" | "preview" | "launching" | "error";
  notification: SynCloudOSNotification | null;
  onOpenNotificationCentre?: (notificationId?: string) => void;
  sections?: WebspringViewProps["model"]["sections"];
  onOpenContent?: WebspringViewProps["actions"]["openApp"];
  onRefreshContent?: WebspringViewProps["actions"]["refreshContent"];
}) {
  void selectedApp;
  void mode;
  void notification;
  const locale = useWebspringLocale();
  const title = locale.t("content.title", "Content");
  const launchDate = locale.t("content.loading", "Loading content…");
  const message = locale.t("content.loadingDetail", "New content will appear here when it is available.");
  const section = sections[0];
  const firstItem = section?.state.status === "ready" ? section.state.items[0] : undefined;
  if (section?.empty === "hide" && (section.state.status === "unavailable" || (section.state.status === "ready" && section.state.items.length === 0))) return null;
  const displayedTitle = firstItem?.title ?? section?.title ?? title;
  const displayedDate = firstItem?.publishedAt
    ? new Intl.DateTimeFormat(locale.activeLocale).format(new Date(firstItem.publishedAt))
    : launchDate;
  const displayedMessage = firstItem?.excerpt ?? (section?.state.status === "error" || section?.state.status === "unavailable"
    ? section.state.message.fallback ?? section.state.message.key
    : message);

  return (
    <section className="webspring-shelf" aria-label={locale.t("shelf.ariaLabel", "Webspring news and status")}>
      <div className="webspring-shelf-texture" aria-hidden="true" />
      <div className="webspring-shelf-glow" aria-hidden="true" />
      <div className="webspring-shelf-highlight" />
      <button
        type="button"
        className="webspring-news webspring-news-button"
        aria-label={firstItem ? `Open ${firstItem.title}` : locale.t("notifications.openCentre", "Open Notification Centre")}
        aria-haspopup={firstItem ? undefined : "dialog"}
        aria-controls={firstItem ? undefined : "syncloudos-notification-centre"}
        onClick={() => firstItem ? void onOpenContent?.(firstItem.destination.appId, firstItem.destination.route) : onOpenNotificationCentre?.(notification?.id)}
      >
        <img src={newsIconUrl} alt="" aria-hidden="true" />
        <div className="webspring-news-text">
          <h2>{displayedTitle}</h2>
          <p className="webspring-news-date">{displayedDate}</p>
        </div>
      </button>
      <p className="webspring-news-copy">{displayedMessage}</p>
      {section?.state.status === "error" ? <button type="button" className="webspring-content-refresh" onClick={() => { void onRefreshContent?.(); }}>Retry</button> : null}
    </section>
  );
}
