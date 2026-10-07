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

import "./nse-layout.css";
import "./nse-stack-view.css";

export {
  NSEFit,
  NSEFlex,
  NSEInline,
  NSEOrdered,
  NSESpacer,
  NSEStack,
  resolveNSESpacing,
  useNSEOrderedChildren
} from "./NSELayout";
export { NSEForm, NSEFormRow, NSEFormSeparator } from "./NSEForm";
export type { NSEFormProps, NSEFormRowProps } from "./NSEForm";
export { NSEText } from "./NSEText";
export type { NSETextProps, NSETextStyle } from "./NSEText";

export { NSEStackItem } from "./NSEStackItem";
export { NSEStackView } from "./NSEStackView";
export { resolveStackLayout } from "./resolveStackLayout";
export type {
  NSEStackAlignment,
  NSEStackDistribution,
  NSEStackEdgeInsets,
  NSEStackFrameScheduler,
  NSEStackGravity,
  NSEStackItemLayout,
  NSEStackItemProps,
  NSEStackLayoutInput,
  NSEStackLayoutResult,
  NSEStackObserver,
  NSEStackObserverFactory,
  NSEStackOrientation,
  NSEStackOverflowPolicy,
  NSEStackResolvedItem,
  NSEStackViewProps,
} from "./stackViewTypes";
export type {
  NSEFitProps,
  NSEFlexAlign,
  NSEFlexDirection,
  NSEFlexJustify,
  NSEFlexProps,
  NSEFlexWrap,
  NSEInlineProps,
  NSELayoutElement,
  NSELayoutGap,
  NSESpacing,
  NSEStackContentAlignment,
  NSEOrderedChildRecord,
  NSEOrderedChildrenOptions,
  NSEOrderedProps,
  NSESpacerProps,
  NSEStackProps
} from "./NSELayout";

