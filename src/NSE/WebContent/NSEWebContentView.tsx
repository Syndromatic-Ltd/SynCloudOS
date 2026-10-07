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

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import "./nse-web-content-view.css";
import type {
  RuntimeWebContentNavigationAuthority,
  RuntimeWebContentSession,
  RuntimeScopedWebContentService,
  RuntimeScopedWebContentSessionRequest,
} from "../../SynCloudOS/SynCloudOS";

interface NSEWebContentSessionViewProps {
  readonly session: RuntimeWebContentSession;
  readonly className?: string;
  readonly ownership?: "parent" | "view";
}

/** Source-bound views receive the same runtime-issued web facade as a SynWare;
 * callers cannot supply or replace app/session/owner provenance. */
export interface NSEWebContentSourceViewProps extends Omit<RuntimeScopedWebContentSessionRequest, "onMessage"> {
  readonly runtime: { readonly webContent: RuntimeScopedWebContentService };
  readonly className?: string;
  readonly onMessage?: RuntimeScopedWebContentSessionRequest["onMessage"];
}

export type NSEWebContentViewProps = NSEWebContentSessionViewProps | NSEWebContentSourceViewProps;

function frameMatchesSnapshot(frame: HTMLIFrameElement, frameSource: string): boolean {
  if (!frameSource || frameSource === "about:blank") return false;
  const live = frame.src || "";
  const attributed = frame.getAttribute("src") ?? "";
  if (!live && !attributed) return false;
  if (live === "about:blank" && (!attributed || attributed === "about:blank")) return false;
  if (live && live !== attributed && live !== "about:blank") return live === frameSource;
  return attributed === frameSource || live === frameSource;
}

function SessionView({ session, className, ownership = "parent" }: NSEWebContentSessionViewProps) {
  const snapshot = useSyncExternalStore(
    (listener) => session.subscribe(listener),
    session.getSnapshot,
    session.getSnapshot,
  );
  const frameRef = useRef<HTMLIFrameElement | null>(null);
  const bindFrame = useCallback((frame: HTMLIFrameElement | null) => {
    frameRef.current = frame;
    session.bindFrame(frame);
  }, [session]);
  useLayoutEffect(() => {
    if (frameRef.current) session.bindFrame(frameRef.current);
  }, [session, snapshot.navigationEpoch]);
  useEffect(() => () => {
    session.bindFrame(null);
    if (ownership === "view") session.dispose();
  }, [ownership, session]);

  const authority = Object.freeze({
    epoch: snapshot.navigationEpoch,
    navigationId: snapshot.navigationId,
    frameSource: snapshot.frameSource,
  }) satisfies RuntimeWebContentNavigationAuthority;
  const settleIfCurrent = (kind: "load" | "error") => (event: { currentTarget: HTMLIFrameElement }) => {
    if (!frameMatchesSnapshot(event.currentTarget, authority.frameSource)) return;
    if (kind === "load") session.didLoad(authority);
    else session.didFail(authority);
  };

  return (
    <iframe
      key={snapshot.navigationId}
      ref={bindFrame}
      className={["nse-web-content-view", className].filter(Boolean).join(" ")}
      title={snapshot.title}
      src={snapshot.frameSource || undefined}
      sandbox={snapshot.sandbox}
      aria-busy={snapshot.state === "loading" ? "true" : undefined}
      aria-label={snapshot.title}
      hidden={snapshot.state === "suspended" || snapshot.state === "closed"}
      data-nse-web-content-session={snapshot.id}
      data-nse-web-content-state={snapshot.state}
      onLoad={settleIfCurrent("load")}
      onError={settleIfCurrent("error")}
    />
  );
}

function SourceBoundView(props: NSEWebContentSourceViewProps) {
  const { runtime, className, onMessage, title, source, capabilities, decodeMessage } = props;
  const request = useMemo(() => ({ title, source, capabilities, decodeMessage }),
    [capabilities, decodeMessage, source, title]);
  const [session, setSession] = useState<RuntimeWebContentSession | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    let mounted = true;
    let owned: RuntimeWebContentSession | null = null;
    void runtime.webContent.createSession({ ...request, onMessage }, controller.signal).then((created) => {
      if (!mounted || controller.signal.aborted) {
        created.dispose();
        return;
      }
      owned = created;
      setSession(created);
    }, () => undefined);
    return () => {
      mounted = false;
      controller.abort();
      owned?.dispose();
    };
  }, [onMessage, request, runtime]);

  if (!session) return <div className={className} aria-busy="true" aria-label={props.title} role="status" />;
  return <SessionView session={session} className={className} ownership="view" />;
}

export function NSEWebContentView(props: NSEWebContentViewProps) {
  return "session" in props ? <SessionView {...props} /> : <SourceBoundView {...props} />;
}
