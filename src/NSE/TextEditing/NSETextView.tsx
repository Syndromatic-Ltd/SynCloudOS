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

import { useEffect, useImperativeHandle, useRef } from "react";
import { mountDOMTextBackend } from "./backends/domTextBackend";
import type { NSETextViewProps } from "./textViewTypes";
import "./text-view.css";

/** A bounded paragraph text view with a supplied canonical owner and per-view session. */
export function NSETextView({ session, label, className, style, spellCheck, attachmentResolver, fontResolver, onDropFiles, ref, onInputError, onGeometry }: NSETextViewProps) {
  const host = useRef<HTMLDivElement>(null);
  const backend = useRef<ReturnType<typeof mountDOMTextBackend> | null>(null);
  const callbacks = useRef({ onInputError, onGeometry }); callbacks.current = { onInputError, onGeometry };
  const presentation = useRef({ label, spellCheck, attachmentResolver, fontResolver, onDropFiles }); presentation.current = { label, spellCheck, attachmentResolver, fontResolver, onDropFiles };
  useImperativeHandle(ref, () => ({ focus: () => backend.current?.focus(), geometry: () => backend.current?.geometry ?? null }), []);
  useEffect(() => { backend.current?.updatePresentation({ label, spellCheck, attachmentResolver, fontResolver, onDropFiles }); }, [session, label, spellCheck, attachmentResolver, fontResolver, onDropFiles]);
  useEffect(() => {
    if (!host.current) return;
    const mounted = mountDOMTextBackend(host.current, { session, ...presentation.current, onError: error => callbacks.current.onInputError?.(error) });
    backend.current = mounted; callbacks.current.onGeometry?.(mounted.geometry);
    return () => { mounted.dispose(); backend.current = null; callbacks.current.onGeometry?.(null); };
  }, [session]);
  return <div ref={host} className={["nse-text-view", className].filter(Boolean).join(" ")} style={style} />;
}
