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

import { cloneElement, useLayoutEffect, type HTMLAttributes, type ReactElement, type ReactNode, type SyntheticEvent } from "react";
import { useNSETooltip } from "./useNSETooltip";
import { useOptionalTooltipProvider } from "./TooltipProvider";

type AnchorProps = HTMLAttributes<HTMLElement>;
interface LabelHelpProps { readonly label: ReactNode; readonly children: ReactElement<AnchorProps> }
/** Keeps the control/ref/owner intact; help uses the existing overlay provider. */
export function NSELabelHelp(props: LabelHelpProps) {
  const provider = useOptionalTooltipProvider();
  return provider && props.label ? <BoundLabelHelp {...props} /> : props.children;
}
function BoundLabelHelp({ label, children }: LabelHelpProps) {
  const binding = useNSETooltip({ content: label });
  // A route/title change ends the old contextual disclosure. Rich-node
  // identity alone does not establish a changed semantic label.
  const semanticLabel = typeof label === "string" || typeof label === "number" ? label : null;
  useLayoutEffect(() => { binding.dismiss?.(); }, [binding.dismiss, semanticLabel]);
  const props: AnchorProps = {};
  const names = ["onFocus", "onBlur", "onPointerEnter", "onPointerLeave", "onPointerDown", "onPointerMove", "onPointerUp", "onPointerCancel", "onClick"] as const;
  for (const name of names) {
    const original = children.props[name];
    const help = binding.anchorProps[name];
    // Native refs and event target remain on the original control. Existing
    // press/navigation behavior runs first; help never owns its action.
    (props as Record<string, unknown>)[name] = (event: SyntheticEvent<HTMLElement>) => {
      (original as ((value: unknown) => void) | undefined)?.(event);
      if (name === "onClick") binding.dismiss?.();
      if (name !== "onFocus" || event.currentTarget.matches(":focus-visible")) {
        (help as ((value: unknown) => void) | undefined)?.(event);
      }
    };
  }
  props["aria-describedby"] = [children.props["aria-describedby"], binding.anchorProps["aria-describedby"]].filter(Boolean).join(" ") || undefined;
  return <>{cloneElement(children, props)}{binding.tooltip}</>;
}
