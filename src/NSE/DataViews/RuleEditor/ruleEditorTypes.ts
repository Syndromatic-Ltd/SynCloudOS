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

import type { HTMLAttributes } from "react";

import type { NSEFormatter, NSEFormatterResult, NSEPredicateComparisonOperator, NSEPredicateExpression, NSEPredicateLiteral, NSEPredicateSchema } from "../../../Foundation/public";
import type { NSEDataViewState } from "../Core";

export interface PredicateOperatorOption {
  readonly operator: NSEPredicateComparisonOperator;
  readonly label: string;
  readonly arity: 0 | 1 | 2;
}

export interface PredicateTemplate<T> {
  readonly id: string;
  readonly field: keyof T & string;
  readonly label: string;
  readonly operators: readonly PredicateOperatorOption[];
  readonly acceptsTextOptions?: boolean;
  readonly formatter: NSEFormatter<unknown>;
  validate(value: unknown): NSEFormatterResult<unknown>;
}

export type RuleRow =
  | {
      readonly id: string;
      readonly kind: "constant";
      readonly value: boolean;
    }
  | {
      readonly id: string;
      readonly kind: "comparison";
      readonly field: string;
      readonly operator: NSEPredicateComparisonOperator;
      readonly value?: NSEPredicateLiteral;
      readonly options?: { readonly caseInsensitive?: boolean; readonly diacriticInsensitive?: boolean };
    }
  | {
      readonly id: string;
      readonly kind: "group";
      readonly operator: "all" | "any" | "none";
      readonly children: readonly RuleRow[];
    };

export interface RuleEditorValue { readonly root: RuleRow }

export interface RuleEditorValidation {
  readonly valid: boolean;
  readonly issues: readonly { readonly rowId: string; readonly message: string }[];
}

export interface NSEPredicateEditorProps<T> extends Omit<HTMLAttributes<HTMLDivElement>, "onChange" | "defaultValue"> {
  readonly schema: NSEPredicateSchema<T>;
  readonly templates?: readonly PredicateTemplate<T>[];
  readonly value?: NSEPredicateExpression;
  readonly defaultValue?: NSEPredicateExpression;
  readonly onChange?: (value: NSEPredicateExpression) => void;
  readonly readOnly?: boolean;
  readonly isEnabled?: boolean;
  readonly locale?: string;
  readonly state?: NSEDataViewState;
}

export interface NSERuleEditorProps extends Omit<HTMLAttributes<HTMLDivElement>, "onChange" | "defaultValue"> {
  readonly value?: RuleEditorValue;
  readonly defaultValue?: RuleEditorValue;
  readonly onChange?: (value: RuleEditorValue) => void;
  readonly onValidationChange?: (validation: RuleEditorValidation) => void;
  readonly fields: readonly string[];
  readonly operators?: readonly PredicateOperatorOption[];
  readonly templates?: readonly PredicateTemplate<unknown>[];
  readonly locale?: string;
  readonly state?: NSEDataViewState;
  readonly readOnly?: boolean;
  readonly isEnabled?: boolean;
}
