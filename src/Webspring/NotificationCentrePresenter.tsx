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

import { normalizeBundleIdentifier } from "../SynCloudOS/Identity/bundleIdentifier.mjs";
import { newsIconUrl } from "../SynCloudOS/Resources/frameworkAssets";
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent, type ReactNode, type RefObject } from "react";
import {
  useNotificationMotion,
  type NotificationMotion,
  type NotificationRotorState,
  type NotificationStatePresentation,
} from "./NotificationCentre.transitions";
import { NSEPresence, useNSEAnimationEnvironment, useNSEPresentation } from "../NSE/Animation";
import { FocusScope, useKernelSynCloudOS } from "../SynCloudOSReact";
import type { SynCloudOSAppInfo } from "../SynCloudOS/SynCloudOS";
import type {
  SynCloudOSNotification,
  SynCloudOSNotificationAction,
  SynCloudOSNotificationGroupSnapshot
} from "../SynCloudOS/SynCloudOS";
import type { RuntimeSnapshot } from "../SynCloudOS/SynCloudOS";
import { createNotificationActionPlan, getPrimaryNotificationAction } from "./notificationActions";
import { getLocalizedWebspringText, useWebspringLocale } from "./webspringLocale";
import {
  captureNotificationSource,
  clearNotificationCanvasMarks,
  collectNotificationCanvasReplacements,
  notificationCubeTopFaceHeight,
  shouldUseNotificationSnapdomCapture,
  warmNotificationCaptureEngine,
  type NotificationCaptureSource
} from "./notificationScreenSliceCapture";

const defaultIcon = newsIconUrl;
const autoDismissMs = 6800;
const notificationCaptureReadyFrames = 2;
const notificationCaptureElementImageTimeoutMs = 180;

type NotificationCentreSnapshot = Pick<RuntimeSnapshot, "appInfo" | "notifications">;

interface NotificationScreenSlice {
  status: "capturing" | "ready" | "fallback";
  src: string | null;
}

function hasBehaviour(notification: SynCloudOSNotification, behaviour: string) {
  return notification.behaviours.includes(behaviour as SynCloudOSNotification["behaviours"][number]);
}

function isActiveNotification(notification: SynCloudOSNotification) {
  return notification.status === "queued" || notification.status === "displayed";
}

function getAppName(notification: SynCloudOSNotification, apps: Record<string, SynCloudOSAppInfo>) {
  return notification.appId ? apps[normalizeBundleIdentifier(notification.appId)]?.displayName ?? notification.appId : "SynCloudOS";
}

function getNotificationIcon(notification: SynCloudOSNotification, apps: Record<string, SynCloudOSAppInfo>) {
  return notification.icon ?? (notification.appId ? apps[normalizeBundleIdentifier(notification.appId)]?.icon.src : undefined) ?? defaultIcon;
}

function formatNotificationTime(timestamp: number, locale: string) {
  return new Intl.DateTimeFormat(locale, {
    hour: "numeric",
    minute: "2-digit"
  }).format(new Date(timestamp));
}

function getVisibleActions(notification: SynCloudOSNotification) {
  const primary = getPrimaryNotificationAction(notification);
  const secondary = notification.actions.find((action) => action.id !== primary?.id && action.kind !== "clearGroup");
  return [primary, secondary].filter((action): action is SynCloudOSNotificationAction => Boolean(action)).slice(0, 2);
}

function statusLabel(notification: SynCloudOSNotification) {
  if (notification.status === "displayed" || notification.status === "queued") return getLocalizedWebspringText("notifications.status.unread", "Unread");
  if (notification.status === "acted") return getLocalizedWebspringText("notifications.status.acted", "Acted");
  if (notification.status === "expired") return getLocalizedWebspringText("notifications.status.expired", "Expired");
  if (notification.status === "archived") return getLocalizedWebspringText("notifications.status.archived", "Archived");
  return getLocalizedWebspringText("notifications.status.read", "Read");
}

function NotificationActionButton({
  action,
  notification,
  onAction
}: {
  action: SynCloudOSNotificationAction;
  notification: SynCloudOSNotification;
  onAction: (notification: SynCloudOSNotification, action: SynCloudOSNotificationAction) => void;
}) {
  return (
    <button
      type="button"
      className={`syncloudos-notification-action ${action.primary ? "is-primary" : ""} ${action.destructive ? "is-destructive" : ""}`}
      onClick={(event) => {
        event.stopPropagation();
        onAction(notification, action);
      }}
    >
      {action.label}
    </button>
  );
}

function NotificationCloseButton({
  label,
  onClick
}: {
  label: string;
  onClick: (event: ReactMouseEvent<HTMLButtonElement>) => void;
}) {
  return (
    <button
      type="button"
      className="syncloudos-notification-close-button"
      aria-label={label}
      onClick={onClick}
    />
  );
}

function waitForAnimationFrame() {
  return new Promise<void>((resolve) => {
    window.requestAnimationFrame(() => resolve());
  });
}

function waitForTimeout(duration: number) {
  return new Promise<void>((resolve) => {
    window.setTimeout(resolve, duration);
  });
}

async function waitForDocumentImages() {
  const images = Array.from(document.images).filter((image) => !image.complete || image.naturalWidth === 0);
  if (images.length === 0) return;

  await Promise.race([
    Promise.allSettled(images.map((image) => image.decode?.() ?? Promise.resolve())),
    waitForTimeout(notificationCaptureElementImageTimeoutMs)
  ]);
}

function useNotificationScreenSlice(
  notificationId: string,
  stageRef: RefObject<HTMLElement | null>,
  reducedMotion: boolean
) {
  const [slice, setSlice] = useState<NotificationScreenSlice>({ status: "capturing", src: null });

  useLayoutEffect(() => {
    let cancelled = false;
    const stage = stageRef.current;
    if (
      !stage ||
      reducedMotion ||
      typeof window === "undefined" ||
      typeof document === "undefined" ||
      typeof HTMLCanvasElement === "undefined" ||
      typeof HTMLImageElement === "undefined" ||
      !shouldUseNotificationSnapdomCapture()
    ) {
      // SnapDOM runs on the main thread, so the helper captures only the clipped
      // banner strip. A local debug flag can disable it if we need the fallback.
      setSlice({ status: "fallback", src: null });
      return undefined;
    }

    const capture = async () => {
      try {
        setSlice({ status: "capturing", src: null });
        for (let frame = 0; frame < notificationCaptureReadyFrames; frame += 1) {
          await waitForAnimationFrame();
          if (cancelled) return;
        }
        if ("fonts" in document) {
          await Promise.race([
            document.fonts.ready,
            new Promise<void>((resolve) => window.setTimeout(resolve, 140))
          ]);
          if (cancelled) return;
        }
        await waitForDocumentImages();
        if (cancelled) return;
        const rect = stage.getBoundingClientRect();
        const viewportHeight = Math.max(1, Math.round(window.innerHeight));
        const scale = Math.max(1, Math.min(window.devicePixelRatio || 1, 2));

        const { snapdom } = await import("@zumer/snapdom");
        if (cancelled) return;

        const captureStrip = new DOMRect(rect.left, rect.top, rect.width, notificationCubeTopFaceHeight);
        const canvasReplacements = collectNotificationCanvasReplacements(captureStrip);

        let source: NotificationCaptureSource;
        try {
          source = await captureNotificationSource(snapdom, canvasReplacements, scale, captureStrip);
        } finally {
          clearNotificationCanvasMarks();
        }
        if (cancelled) return;

        const sourceScaleX = source.canvas.width / Math.max(1, source.rect.width);
        const sourceScaleY = source.canvas.height / Math.max(1, source.rect.height);
        const cropLeft = Math.max(0, (rect.left - source.rect.left) * sourceScaleX);
        const cropTop = Math.max(0, (rect.top - source.rect.top) * sourceScaleY);
        const cropWidth = Math.max(1, Math.min(rect.width * sourceScaleX, source.canvas.width - cropLeft));
        const cropHeight = Math.max(
          1,
          Math.min(
            notificationCubeTopFaceHeight * sourceScaleY,
            source.canvas.height - cropTop,
            viewportHeight * sourceScaleY
          )
        );
        const crop = document.createElement("canvas");
        crop.width = Math.max(1, Math.round(cropWidth));
        crop.height = Math.max(1, Math.round(cropHeight));
        const context = crop.getContext("2d");
        if (!context) {
          setSlice({ status: "fallback", src: null });
          return;
        }
        context.drawImage(source.canvas, cropLeft, cropTop, cropWidth, cropHeight, 0, 0, crop.width, crop.height);
        setSlice({ status: "ready", src: crop.toDataURL("image/png") });
      } catch (error) {
        console.warn("Notification banner screen-slice capture failed.", error);
        if (!cancelled) setSlice({ status: "fallback", src: null });
      }
    };

    void capture();
    return () => {
      cancelled = true;
    };
  }, [notificationId, stageRef, reducedMotion]);

  return slice;
}

/** The banner cube's rotor, flipped between states through AnimationFX. */
function NotificationRotor({ state, motion, children }: {
  readonly state: NotificationRotorState;
  readonly motion: NotificationMotion;
  readonly children: ReactNode;
}) {
  const rotorRef = useRef<HTMLDivElement>(null);
  const presentation = motion.rotor(state);
  useNSEPresentation(rotorRef, { state, enter: presentation.enter, exit: motion.rotorExit(state) });
  return <div ref={rotorRef} className="syncloudos-notification-cube-rotor" style={presentation.style}>{children}</div>;
}

/** A cube face that settles into its shaded model state as the cube turns. */
function NotificationCubeFace({ className, presentation, children }: {
  readonly className: string;
  readonly presentation: NotificationStatePresentation;
  readonly children: ReactNode;
}) {
  const faceRef = useRef<HTMLDivElement>(null);
  useNSEPresentation(faceRef, { enter: presentation.enter });
  return <div ref={faceRef} className={className} aria-hidden="true" style={presentation.style}>{children}</div>;
}

const bannerDrag = Object.freeze({ top: -82, bottom: 12, elastic: 0.28, threshold: 3, dismissOffset: -34, dismissVelocity: -420 });

/**
 * Lets the banner be dragged vertically: beyond its constraints it follows
 * elastically, and an upward flick or pull dismisses it. A banner released
 * without dismissing springs back to rest through AnimationFX. A drag never
 * also activates the banner.
 */
function useBannerDrag(
  articleRef: RefObject<HTMLElement | null>,
  release: NotificationMotion["dragRelease"],
  onDismiss: () => void,
) {
  const drag = useRef<{ pointerId: number; startY: number; offset: number; moved: boolean; samples: { y: number; time: number }[] } | null>(null);
  const suppressClick = useRef(false);
  const [rest, setRest] = useState({ serial: 0, offset: 0 });
  useNSEPresentation(articleRef, {
    state: `rest:${rest.serial}`,
    enter: (previous) => previous !== null && release && rest.offset !== 0 ? release(rest.offset) : null,
  });
  const elastic = (offset: number) => offset < bannerDrag.top
    ? bannerDrag.top + (offset - bannerDrag.top) * bannerDrag.elastic
    : offset > bannerDrag.bottom ? bannerDrag.bottom + (offset - bannerDrag.bottom) * bannerDrag.elastic : offset;
  const end = (event: ReactPointerEvent<HTMLElement>, cancelled: boolean) => {
    const current = drag.current;
    if (!current || current.pointerId !== event.pointerId) return;
    drag.current = null;
    if (!current.moved) return;
    suppressClick.current = true;
    const recent = current.samples.filter(({ time }) => event.timeStamp - time <= 100);
    const first = recent[0] ?? current.samples[0], last = current.samples.at(-1);
    const velocity = first && last && last.time > first.time ? ((last.y - first.y) / (last.time - first.time)) * 1000 : 0;
    if (!cancelled && (current.offset < bannerDrag.dismissOffset || velocity < bannerDrag.dismissVelocity)) {
      // The banner leaves from where it was let go.
      onDismiss();
      return;
    }
    articleRef.current?.style.removeProperty("transform");
    setRest((previous) => ({ serial: previous.serial + 1, offset: current.offset }));
  };
  return {
    onPointerDown(event: ReactPointerEvent<HTMLElement>) {
      if (!event.isPrimary || event.button !== 0) return;
      drag.current = { pointerId: event.pointerId, startY: event.clientY, offset: 0, moved: false, samples: [] };
    },
    onPointerMove(event: ReactPointerEvent<HTMLElement>) {
      const current = drag.current;
      if (!current || current.pointerId !== event.pointerId) return;
      const distance = event.clientY - current.startY;
      if (!current.moved) {
        if (Math.abs(distance) < bannerDrag.threshold) return;
        current.moved = true;
        event.currentTarget.setPointerCapture?.(event.pointerId);
      }
      current.offset = elastic(distance);
      current.samples.push({ y: current.offset, time: event.timeStamp });
      if (current.samples.length > 12) current.samples.shift();
      // Direct manipulation: the banner follows the pointer this frame.
      event.currentTarget.style.transform = `translateY(${current.offset}px)`;
    },
    onPointerUp: (event: ReactPointerEvent<HTMLElement>) => end(event, false),
    onPointerCancel: (event: ReactPointerEvent<HTMLElement>) => end(event, true),
    onClickCapture(event: ReactMouseEvent<HTMLElement>) {
      if (!suppressClick.current) return;
      suppressClick.current = false;
      event.preventDefault();
      event.stopPropagation();
    },
  };
}

function NotificationBanner({
  notification,
  apps,
  queueCount,
  onDismiss,
  onOpenCentre,
  onRunAction
}: {
  notification: SynCloudOSNotification;
  apps: Record<string, SynCloudOSAppInfo>;
  queueCount: number;
  onDismiss: (notification: SynCloudOSNotification, reason?: string) => void;
  onOpenCentre: (notificationId?: string) => void;
  onRunAction: (notification: SynCloudOSNotification, action?: SynCloudOSNotificationAction | null) => void;
}) {
  const stageRef = useRef<HTMLDivElement>(null);
  const articleRef = useRef<HTMLElement>(null);
  const { reducedMotion } = useNSEAnimationEnvironment();
  const notificationMotion = useNotificationMotion();
  const screenSlice = useNotificationScreenSlice(notification.id, stageRef, reducedMotion);
  const { t, activeLocale } = useWebspringLocale();
  const [displayedNotification, setDisplayedNotification] = useState(notification);
  const [visibleScreenSlice, setVisibleScreenSlice] = useState<NotificationScreenSlice>(screenSlice);
  const [rotorState, setRotorState] = useState<NotificationRotorState>("hidden");
  const [rotorVersion, setRotorVersion] = useState(0);
  const [isReplacing, setIsReplacing] = useState(false);
  const replacementSequenceRef = useRef(0);
  useNSEPresentation(stageRef, notificationMotion.bannerStage);
  const drag = useBannerDrag(articleRef, notificationMotion.dragRelease, () => onDismiss(displayedNotification, "dragDismissed"));
  const activeScreenSlice =
    screenSlice.status === "capturing" && visibleScreenSlice.status !== "capturing"
      ? visibleScreenSlice
      : screenSlice;
  const actions = getVisibleActions(displayedNotification);
  const appName = getAppName(displayedNotification, apps);
  const icon = getNotificationIcon(displayedNotification, apps);

  useEffect(() => {
    if (screenSlice.status === "capturing") return;
    setVisibleScreenSlice(screenSlice);
  }, [screenSlice.status, screenSlice.src]);

  useEffect(() => {
    if (activeScreenSlice.status === "capturing") return;
    if (displayedNotification.id !== notification.id) return;
    if (isReplacing) return;
    setRotorState("presented");
  }, [activeScreenSlice.status, displayedNotification.id, isReplacing, notification.id]);

  useEffect(() => {
    if (displayedNotification.id === notification.id) return;
    const sequence = replacementSequenceRef.current + 1;
    replacementSequenceRef.current = sequence;

    const replaceBanner = async () => {
      setIsReplacing(true);
      // The rotor flips the old banner away, a new rotor takes its place
      // edge-on, and flips the new banner in.
      setRotorState("replaced");
      await waitForTimeout(250);
      if (replacementSequenceRef.current !== sequence) return;
      setRotorState("incoming");
      setDisplayedNotification(notification);
      setRotorVersion((version) => version + 1);
      await waitForAnimationFrame();
      if (replacementSequenceRef.current !== sequence) return;
      setRotorState("presented");
      await waitForTimeout(260);
      if (replacementSequenceRef.current === sequence) setIsReplacing(false);
    };

    void replaceBanner();
  }, [displayedNotification.id, notification.id]);

  return (
    <div
      ref={stageRef}
      className="syncloudos-notification-banner-stage"
      data-slice-status={activeScreenSlice.status}
    >
      {activeScreenSlice.status === "capturing" ? <div className="syncloudos-notification-stage-measure" aria-hidden="true" /> : (
        <>
          <div className="syncloudos-notification-cube-void" aria-hidden="true" />
          <div className="syncloudos-notification-cube">
            <NotificationRotor key={`notification-cube-rotor-${rotorVersion}`} state={rotorState} motion={notificationMotion}>
              <NotificationCubeFace
                className={`syncloudos-notification-cube-face syncloudos-notification-screen-face ${activeScreenSlice.src ? "has-captured-slice" : "uses-fallback-slice"}`}
                presentation={notificationMotion.bannerScreenFace}
              >
                {activeScreenSlice.src ? (
                  <img className="syncloudos-notification-screen-face-image" src={activeScreenSlice.src} alt="" draggable={false} />
                ) : (
                  <div className="syncloudos-notification-screen-face-fallback" />
                )}
              </NotificationCubeFace>
              <NotificationCubeFace
                className="syncloudos-notification-cube-face syncloudos-notification-cube-under-face"
                presentation={notificationMotion.bannerStatusStrip}
              >
                <div className="syncloudos-notification-cube-under-glow" />
              </NotificationCubeFace>
              <div className="syncloudos-notification-cube-face syncloudos-notification-banner-face">
                <article
                  ref={articleRef}
                  className={`syncloudos-notification-banner priority-${displayedNotification.priority}`}
                  role={displayedNotification.priority === "timeSensitive" || displayedNotification.priority === "critical" ? "alert" : "status"}
                  aria-label={`${appName}: ${displayedNotification.title}. ${displayedNotification.message}`}
                  tabIndex={0}
                  onKeyDown={(event) => {
                    if (event.key === "Escape" && displayedNotification.delivery.interruptible !== false) {
                      event.preventDefault();
                      onDismiss(displayedNotification, "escape");
                    }
                  }}
                  {...drag}
                  onClick={() => onRunAction(displayedNotification)}
                >
                  <div className="syncloudos-notification-face-shade" aria-hidden="true" />
                  <div className="syncloudos-notification-banner-content">
                    <button
                      type="button"
                      className="syncloudos-notification-app-icon-button"
                      aria-label={t("notifications.openCentre", "Open Notification Centre")}
                      aria-haspopup="dialog"
                      aria-controls="syncloudos-notification-centre"
                      onClick={(event) => {
                        event.stopPropagation();
                        onOpenCentre(displayedNotification.id);
                      }}
                    >
                      <img className="syncloudos-notification-icon" src={icon} alt="" aria-hidden="true" />
                    </button>
                    <div className="syncloudos-notification-copy">
                      <div className="syncloudos-notification-meta">
                        <span>{appName}</span>
                        <span>{formatNotificationTime(displayedNotification.createdAt, activeLocale)}</span>
                        {queueCount > 1 ? <span>{t("notifications.queueCount", "{count} queued", { count: queueCount })}</span> : null}
                      </div>
                      <h2>{displayedNotification.title}</h2>
                      <p>{displayedNotification.message}</p>
                    </div>
                    <div className="syncloudos-notification-banner-tools">
                      <NotificationCloseButton
                        label={t("notifications.dismiss", "Dismiss notification")}
                        onClick={(event) => {
                          event.stopPropagation();
                          onDismiss(displayedNotification);
                        }}
                      />
                    </div>
                  </div>
                  {actions.length > 0 ? (
                    <div className="syncloudos-notification-banner-actions" aria-label={t("notifications.actions", "Notification actions")}>
                      {actions.map((action) => (
                        <NotificationActionButton
                          key={action.id}
                          action={action}
                          notification={displayedNotification}
                          onAction={onRunAction}
                        />
                      ))}
                    </div>
                  ) : null}
                </article>
              </div>
            </NotificationRotor>
          </div>
        </>
      )}
    </div>
  );
}

function NotificationGroup({
  group,
  apps,
  expanded,
  selectedId,
  onToggle,
  onClear,
  onSelect,
  onRunAction,
  onDismiss
}: {
  group: SynCloudOSNotificationGroupSnapshot;
  apps: Record<string, SynCloudOSAppInfo>;
  expanded: boolean;
  selectedId: string | null;
  onToggle: (groupKey: string) => void;
  onClear: (groupKey: string) => void;
  onSelect: (notificationId: string) => void;
  onRunAction: (notification: SynCloudOSNotification, action?: SynCloudOSNotificationAction | null) => void;
  onDismiss: (notification: SynCloudOSNotification, reason?: string) => void;
}) {
  const { t } = useWebspringLocale();
  const latest = group.latest;
  const appName = getAppName(latest, apps);
  const activeCount = group.notifications.filter(isActiveNotification).length;

  return (
    <section className="syncloudos-notification-group" aria-labelledby={`notification-group-${group.key}`}>
      <div className="syncloudos-notification-group-head">
        <button
          type="button"
          id={`notification-group-${group.key}`}
          className="syncloudos-notification-group-toggle"
          aria-expanded={expanded}
          onClick={() => onToggle(group.key)}
        >
          <span className="syncloudos-notification-group-title">{group.title ?? appName}</span>
          <span className="syncloudos-notification-group-meta">
            {t(group.count === 1 ? "notifications.itemCount.one" : "notifications.itemCount.many", group.count === 1 ? "{count} item" : "{count} items", { count: group.count })}
            {" - "}
            {t("notifications.unreadCount", "{count} unread", { count: group.unreadCount })}
          </span>
        </button>
        <button
          type="button"
          className="syncloudos-notification-clear"
          disabled={activeCount === 0}
          onClick={() => onClear(group.key)}
        >
          {t("notifications.clear", "Clear")}
        </button>
      </div>
      <NSEPresence initial={false}>
        {expanded ? (
          <NotificationGroupBody>
            {group.notifications.map((notification) => {
              const actions = getVisibleActions(notification);
              const selected = selectedId === notification.id;
              return (
                <article
                  key={notification.id}
                  className={`syncloudos-notification-history-item ${selected ? "is-selected" : ""} status-${notification.status}`}
                  aria-current={selected ? "true" : undefined}
                >
                  <button
                    type="button"
                    className="syncloudos-notification-history-main"
                    onClick={() => onSelect(notification.id)}
                  >
                    <img src={getNotificationIcon(notification, apps)} alt="" aria-hidden="true" />
                    <span>
                      <strong>{notification.title}</strong>
                      <span>{notification.message}</span>
                    </span>
                    <small>{statusLabel(notification)}</small>
                  </button>
                  <div className="syncloudos-notification-history-actions">
                    {actions.map((action) => (
                      <NotificationActionButton
                        key={action.id}
                        action={action}
                        notification={notification}
                        onAction={onRunAction}
                      />
                    ))}
                    {isActiveNotification(notification) ? (
                      <button
                        type="button"
                        className="syncloudos-notification-action"
                        onClick={() => onDismiss(notification, "markRead")}
                      >
                        {t("notifications.markRead", "Mark read")}
                      </button>
                    ) : null}
                  </div>
                </article>
              );
            })}
          </NotificationGroupBody>
        ) : null}
      </NSEPresence>
    </section>
  );
}

/** A group's history, disclosed and hidden by growing and shrinking to fit. */
function NotificationGroupBody({ children }: { readonly children: ReactNode }) {
  const bodyRef = useRef<HTMLDivElement>(null);
  useNSEPresentation(bodyRef, useNotificationMotion().group);
  return <div ref={bodyRef} className="syncloudos-notification-group-body">{children}</div>;
}

function NotificationDetail({
  notification,
  apps,
  onRunAction
}: {
  notification: SynCloudOSNotification | null;
  apps: Record<string, SynCloudOSAppInfo>;
  onRunAction: (notification: SynCloudOSNotification, action?: SynCloudOSNotificationAction | null) => void;
}) {
  const { t, activeLocale } = useWebspringLocale();

  if (!notification) {
    return (
      <aside className="syncloudos-notification-detail" aria-label={t("notifications.detail", "Notification detail")}>
        <p>{t("notifications.selectDetail", "Select a notification to inspect its details.")}</p>
      </aside>
    );
  }

  return (
    <aside className="syncloudos-notification-detail" aria-label={`${notification.title} details`}>
      <div className="syncloudos-notification-detail-head">
        <img src={getNotificationIcon(notification, apps)} alt="" aria-hidden="true" />
        <div>
          <p>{getAppName(notification, apps)}</p>
          <h3>{notification.title}</h3>
        </div>
      </div>
      <p>{notification.message}</p>
      <dl>
        <div>
          <dt>{t("notifications.statusLabel", "Status")}</dt>
          <dd>{statusLabel(notification)}</dd>
        </div>
        <div>
          <dt>{t("notifications.kind", "Kind")}</dt>
          <dd>{notification.kind}</dd>
        </div>
        <div>
          <dt>{t("notifications.priority", "Priority")}</dt>
          <dd>{notification.priority}</dd>
        </div>
        <div>
          <dt>{t("notifications.time", "Time")}</dt>
          <dd>{formatNotificationTime(notification.createdAt, activeLocale)}</dd>
        </div>
      </dl>
      {notification.actions.length > 0 ? (
        <div className="syncloudos-notification-detail-actions">
          {notification.actions.map((action) => (
            <NotificationActionButton
              key={action.id}
              action={action}
              notification={notification}
              onAction={onRunAction}
            />
          ))}
        </div>
      ) : null}
    </aside>
  );
}

function NotificationCentreSurface({
  groups,
  apps,
  activeCount,
  selectedId,
  onClose,
  onClearAll,
  onClearGroup,
  onSelect,
  onRunAction,
  onDismiss
}: {
  groups: SynCloudOSNotificationGroupSnapshot[];
  apps: Record<string, SynCloudOSAppInfo>;
  activeCount: number;
  selectedId: string | null;
  onClose: () => void;
  onClearAll: () => void;
  onClearGroup: (groupKey: string) => void;
  onSelect: (notificationId: string) => void;
  onRunAction: (notification: SynCloudOSNotification, action?: SynCloudOSNotificationAction | null) => void;
  onDismiss: (notification: SynCloudOSNotification, reason?: string) => void;
}) {
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const surfaceRef = useRef<HTMLElement>(null);
  useNSEPresentation(surfaceRef, useNotificationMotion().centre);
  const { t } = useWebspringLocale();
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(() => new Set(groups.slice(0, 2).map((group) => group.key)));
  const selectedNotification = useMemo(
    () => groups.flatMap((group) => group.notifications).find((notification) => notification.id === selectedId) ?? groups[0]?.latest ?? null,
    [groups, selectedId]
  );

  useEffect(() => {
    closeButtonRef.current?.focus();
  }, []);

  function toggleGroup(groupKey: string) {
    setExpandedGroups((current) => {
      const next = new Set(current);
      if (next.has(groupKey)) next.delete(groupKey);
      else next.add(groupKey);
      return next;
    });
  }

  return (
    <section
      ref={surfaceRef}
      id="syncloudos-notification-centre"
      className="syncloudos-notification-centre"
      role="dialog"
      aria-modal="false"
      aria-labelledby="syncloudos-notification-centre-title"
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          onClose();
        }
      }}
    >
      <header className="syncloudos-notification-centre-head">
        <div>
          <p>SynCloudOS</p>
          <h2 id="syncloudos-notification-centre-title">{t("notifications.centreTitle", "Notification Centre")}</h2>
        </div>
        <div className="syncloudos-notification-centre-tools">
          <button type="button" disabled={activeCount === 0} onClick={onClearAll}>
            {t("notifications.clearAll", "Clear All")}
          </button>
          <button ref={closeButtonRef} type="button" aria-label={t("notifications.closeCentre", "Close Notification Centre")} onClick={onClose}>
            x
          </button>
        </div>
      </header>
      <div className="syncloudos-notification-centre-layout">
        <div className="syncloudos-notification-groups" aria-label={t("notifications.history", "Notification history")}>
          {groups.length === 0 ? (
            <p className="syncloudos-notification-empty">{t("notifications.empty", "No notifications yet.")}</p>
          ) : (
            groups.map((group) => (
              <NotificationGroup
                key={group.key}
                group={group}
                apps={apps}
                expanded={expandedGroups.has(group.key)}
                selectedId={selectedNotification?.id ?? null}
                onToggle={toggleGroup}
                onClear={onClearGroup}
                onSelect={onSelect}
                onRunAction={onRunAction}
                onDismiss={onDismiss}
              />
            ))
          )}
        </div>
        <NotificationDetail notification={selectedNotification} apps={apps} onRunAction={onRunAction} />
      </div>
    </section>
  );
}

export function NotificationCentrePresenter({
  snapshot,
  reducedMotion = false,
  openRequest,
  presentationReady = true
}: {
  snapshot: NotificationCentreSnapshot;
  reducedMotion?: boolean;
  openRequest?: { key: number; notificationId?: string | null } | null;
  presentationReady?: boolean;
}) {
  const { t } = useWebspringLocale();
  const runtime = useKernelSynCloudOS();
  const presenter = useMemo(() => {
    const history = snapshot.notifications;
    const active = history.filter(isActiveNotification);
    const grouped = new Map<string, SynCloudOSNotification[]>();
    for (const notification of history) {
      const groupKey = notification.groupKey ?? notification.group.key;
      grouped.set(groupKey, [...(grouped.get(groupKey) ?? []), notification]);
    }
    const groups = Array.from(grouped, ([key, notifications]) => {
      const sorted = [...notifications].sort((left, right) => right.createdAt - left.createdAt);
      const latest = sorted[0];
      return {
        key,
        appId: latest.group.appId,
        kind: latest.group.kind,
        threadKey: latest.group.threadKey,
        dateKey: latest.group.dateKey,
        title: latest.group.title,
        count: sorted.length,
        unreadCount: sorted.filter(isActiveNotification).length,
        notificationIds: sorted.map((notification) => notification.id),
        latest,
        notifications: sorted,
      } as SynCloudOSNotificationGroupSnapshot;
    });
    const banner = active[0] ?? null;
    return {
      banner,
      queue: active,
      activeCount: active.length,
      groups,
      liveRegionText: banner ? `${banner.title}. ${banner.message}` : null,
      reducedMotion,
    };
  }, [reducedMotion, snapshot]);
  const banner = presenter.banner;
  const bannerId = banner?.id ?? null;
  const [centreOpen, setCentreOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(bannerId);
  const focusReturnRef = useRef<HTMLElement | null>(null);
  const groups = presenter.groups;

  useEffect(() => {
    if (shouldUseNotificationSnapdomCapture()) warmNotificationCaptureEngine();
  }, []);

  useEffect(() => {
    if (!openRequest) return;
    openCentre(openRequest.notificationId ?? undefined);
  }, [openRequest?.key]);

  useEffect(() => {
    if (!banner || !presentationReady) return;
    const activeBanner = banner;
    setSelectedId((current) => current ?? activeBanner.id);
    if (hasBehaviour(activeBanner, "persistent") || hasBehaviour(activeBanner, "requiresAction")) return;
    const timeout = window.setTimeout(() => {
      void runtime.notifications.dismiss(activeBanner.id, "timeout");
    }, autoDismissMs);
    return () => window.clearTimeout(timeout);
  }, [bannerId, presentationReady]);

  function dismiss(notification: SynCloudOSNotification, reason = "dismissed") {
    if (notification.delivery.interruptible === false && reason !== "markRead") return;
    void runtime.notifications.dismiss(notification.id, reason);
  }

  function clearGroup(groupKey: string) {
    groups.find((group) => group.key === groupKey)?.notificationIds.forEach((id) => { void runtime.notifications.dismiss(id, "group-cleared"); });
  }

  function clearAll() {
    groups.forEach((group) => {
      group.notificationIds.forEach((id) => { void runtime.notifications.dismiss(id, "centre-cleared"); });
    });
  }

  function openCentre(notificationId?: string) {
    if (typeof document !== "undefined" && document.activeElement instanceof HTMLElement) {
      focusReturnRef.current = document.activeElement;
    }
    if (notificationId) setSelectedId(notificationId);
    setCentreOpen(true);
  }

  function closeCentre() {
    setCentreOpen(false);
    const focusTarget = focusReturnRef.current;
    focusReturnRef.current = null;
    if (focusTarget && typeof window !== "undefined") {
      window.setTimeout(() => focusTarget.focus({ preventScroll: true }), 0);
    }
  }

  function runAction(notification: SynCloudOSNotification, action?: SynCloudOSNotificationAction | null) {
    const plan = createNotificationActionPlan(notification, action ?? getPrimaryNotificationAction(notification));

    if (plan.kind === "openNotificationCentre") {
      openCentre(notification.id);
      return;
    }

    if (plan.kind === "clearGroup") {
      clearGroup(plan.groupKey);
      return;
    }

    if (plan.kind === "viewDetails") {
      if (plan.shouldAct && plan.actionId) void runtime.notifications.invokeAction(plan.notificationId, plan.actionId);
      openCentre(notification.id);
      return;
    }

    if (plan.kind === "dismiss" || plan.kind === "markAsRead") {
      if (plan.actionId) void runtime.notifications.invokeAction(plan.notificationId, plan.actionId);
      else void runtime.notifications.dismiss(plan.notificationId, plan.kind);
      return;
    }

    if (plan.shouldAct && plan.actionId) void runtime.notifications.invokeAction(plan.notificationId, plan.actionId);

    if (plan.kind === "openRoute" && plan.route) {
      void runtime.routes.openRoute(plan.route, { source: "notification" }).result;
    } else if (plan.kind === "openApp" && plan.appId) {
      const app = runtime.apps.getApp(plan.appId);
      if (app) void runtime.routes.openRoute(app.route, { source: "notification" }).result;
    } else if (plan.kind === "retry" && plan.appId) {
      const app = runtime.apps.getApp(plan.appId);
      if (app) void runtime.routes.openRoute(app.route, { source: "notification", context: { retry: true } }).result;
    } else if (plan.kind === "reply") {
      openCentre(notification.id);
      return;
    }

    if (plan.shouldCloseCentre) closeCentre();
  }

  return (
    <aside
      className="syncloudos-notification-layer"
      aria-label={t("notifications.layerAriaLabel", "SynCloudOS Notification Centre")}
      data-reduced-motion={presenter.reducedMotion ? "true" : "false"}
    >
      <div className="syncloudos-notification-live-region" role="status" aria-live="polite" aria-atomic="true">
        {presenter.liveRegionText ?? ""}
      </div>
      <NSEPresence>
        {presentationReady && banner && !centreOpen ? (
          <NotificationBanner
            key="syncloudos-notification-banner"
            notification={banner}
            apps={snapshot.appInfo}
            queueCount={presenter.queue.length}
            onDismiss={dismiss}
            onOpenCentre={openCentre}
            onRunAction={runAction}
          />
        ) : null}
      </NSEPresence>
      <NSEPresence>
        {centreOpen ? (
          <FocusScope scopeId="notification-centre" kind="popover" parentResponderId="webspring">
            <NotificationCentreSurface
              groups={groups}
              apps={snapshot.appInfo}
              activeCount={presenter.activeCount}
              selectedId={selectedId}
              onClose={closeCentre}
              onClearAll={clearAll}
              onClearGroup={clearGroup}
              onSelect={setSelectedId}
              onRunAction={runAction}
              onDismiss={dismiss}
            />
          </FocusScope>
        ) : null}
      </NSEPresence>
    </aside>
  );
}
