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

import type {
  Formatter,
  FormatterContext,
  FormatterResult,
  ValueTransformer,
} from "../../SynCloudOS/Models";
import { defineSyncUndoAction } from "../../SynCloudOS/nseRuntimeContracts";
import {
  ControllerEditingStateError,
  ControllerReadOnlyError,
  UnknownControllerFieldError,
  NSEController,
  type NSEControllerOwnership,
  type ControllerCommitResult,
  type ControllerEditTransaction,
  type ControllerValidationIssue,
} from "./NSEController";
import { mutableClone, ownImmutable } from "./immutableValue";

export interface ObjectControllerField<T extends object, V> {
  read(content: T): V;
  write(content: T, value: V): T;
  readonly formatter?: Formatter<any>;
  readonly transformer?: ValueTransformer<any, V>;
  readonly validate?: (
    value: V,
    content: T,
  ) => readonly ControllerValidationIssue[];
}

export type ObjectControllerFields<T extends object> = Readonly<
  Record<string, ObjectControllerField<T, any>>
>;

export interface ObjectControllerSnapshot<T extends object> {
  readonly revision: number;
  readonly content: T;
  readonly draft: T | null;
  readonly editable: boolean;
  readonly issues: readonly ControllerValidationIssue[];
}

export interface ObjectControllerOptions<T extends object> extends NSEControllerOwnership {
  readonly id: string;
  readonly responderId?: string;
  readonly content: T;
  readonly fields: ObjectControllerFields<T>;
  readonly editable?: boolean;
  readonly clone?: (value: T) => T;
}

export interface ObjectControllerChange<T extends object> {
  readonly kind: "content" | "editing" | "validation";
  readonly snapshot: ObjectControllerSnapshot<T>;
}

function freezeIssues(
  issues: readonly ControllerValidationIssue[],
): readonly ControllerValidationIssue[] {
  return Object.freeze(
    issues.map((issue) => Object.freeze({ ...issue })),
  );
}

function freezeObjectSnapshot<T extends object>(
  snapshot: ObjectControllerSnapshot<T>,
): ObjectControllerSnapshot<T> {
  return Object.freeze({
    ...snapshot,
    content: snapshot.content,
    draft: snapshot.draft,
    issues: freezeIssues(snapshot.issues),
  });
}

export class NSEObjectController<T extends object> extends NSEController<
  ObjectControllerSnapshot<T>,
  ObjectControllerChange<T>
> {
  readonly #fields: ObjectControllerFields<T>;
  readonly #clone: (value: T) => T;
  #snapshot: ObjectControllerSnapshot<T>;
  #changedDuringEdit = false;

  constructor(options: ObjectControllerOptions<T>) {
    super({ kind: "NSEObjectController", id: options.id, responderId: options.responderId, ownerSignal: options.ownerSignal });
    this.#fields = Object.freeze(
      Object.assign(Object.create(null), options.fields),
    ) as ObjectControllerFields<T>;
    this.#clone = options.clone ?? structuredClone;
    this.#snapshot = freezeObjectSnapshot({
      revision: 0,
      content: this.#owned(options.content),
      draft: null,
      editable: options.editable ?? true,
      issues: [],
    });
  }

  getSnapshot = (): ObjectControllerSnapshot<T> => this.#snapshot;

  beginEditing(transaction: ControllerEditTransaction): void {
    if (!this.#snapshot.editable) throw new ControllerReadOnlyError();
    if (this.editTransaction?.id === transaction.id) return;
    this.beginEditTransaction(transaction);
    this.#changedDuringEdit = false;
    this.#replace("editing", {
      draft: this.#owned(mutableClone(this.#snapshot.content)),
      issues: [],
    });
  }

  setField<V>(fieldName: string, value: V): boolean {
    this.assertActive("setField");
    const field = this.#requireField<V>(fieldName);
    const draft = this.#requireDraft();
    const issues = field.validate?.(value, draft) ?? [];
    if (issues.length > 0) {
      this.#replace("validation", { issues });
      return false;
    }
    const next = field.write(mutableClone(draft), value);
    this.#changedDuringEdit = true;
    this.#replace("editing", {
      draft: this.#owned(next),
      issues: [],
    });
    return true;
  }

  setFieldText(
    fieldName: string,
    text: string,
    context: FormatterContext,
  ): FormatterResult<unknown> {
    const field = this.#requireField<unknown>(fieldName);
    if (!field.formatter) {
      return {
        ok: false,
        error: {
          code: "controller.formatterMissing",
          message: `Field "${fieldName}" has no formatter.`,
          input: text,
        },
      };
    }
    const parsed = field.formatter.parse(text, context);
    if (!parsed.ok) return parsed;
    const value = field.transformer
      ? field.transformer.transform(parsed.value)
      : parsed.value;
    return this.setField(fieldName, value)
      ? { ok: true, value }
      : {
          ok: false,
          error: {
            code: "controller.validation",
            message: this.#snapshot.issues[0]?.message ?? "The value is invalid.",
            input: text,
          },
        };
  }

  commitEditing(): ControllerCommitResult {
    this.assertActive("commitEditing");
    const transaction = this.editTransaction;
    const draft = this.#snapshot.draft;
    if (!transaction || draft === null) return { status: "not-editing" };
    if (this.#snapshot.issues.length > 0) {
      return {
        status: "invalid",
        transactionId: transaction.id,
        issues: this.#snapshot.issues,
      };
    }

    const before = this.#owned(this.#snapshot.content);
    const after = this.#owned(draft);
    const changed = this.#changedDuringEdit;
    const undoActionId =
      changed && transaction.undoManager
        ? transaction.undoManager.register(
            defineSyncUndoAction({
              name: transaction.actionName,
              asyncPolicy: "forbid",
              undo: () => {
                this.#applyCommitted(this.#owned(before));
              },
              redo: () => {
                this.#applyCommitted(this.#owned(after));
              },
            }),
            transaction.automaticGroup
              ? { automaticGroup: transaction.automaticGroup }
              : undefined,
          )
        : null;
    this.editTransaction = null;
    this.#changedDuringEdit = false;
    this.#applyCommitted(after);
    return {
      status: "committed",
      transactionId: transaction.id,
      undoActionId,
    };
  }

  discardEditing(): void {
    if (!this.editTransaction) return;
    this.editTransaction = null;
    this.#changedDuringEdit = false;
    this.#replace("editing", { draft: null, issues: [] });
  }

  #owned(value: T): T {
    return ownImmutable(value, this.#clone);
  }

  #requireDraft(): T {
    if (!this.editTransaction || this.#snapshot.draft === null) {
      throw new ControllerEditingStateError(
        "Begin editing before changing a field.",
      );
    }
    return this.#snapshot.draft;
  }

  #applyCommitted(content: T): void {
    this.#replace("content", {
      content: this.#owned(content),
      draft: null,
      issues: [],
    });
  }

  #requireField<V>(fieldName: string): ObjectControllerField<T, V> {
    if (!Object.hasOwn(this.#fields, fieldName)) {
      throw new UnknownControllerFieldError(fieldName);
    }
    const field = this.#fields[fieldName];
    if (!field) throw new UnknownControllerFieldError(fieldName);
    return field as ObjectControllerField<T, V>;
  }

  #replace(
    kind: ObjectControllerChange<T>["kind"],
    patch: Partial<Omit<ObjectControllerSnapshot<T>, "revision" | "editable">>,
  ): void {
    this.#snapshot = freezeObjectSnapshot({
      ...this.#snapshot,
      ...patch,
      revision: this.#snapshot.revision + 1,
    });
    this.publish({ kind, snapshot: this.#snapshot });
  }
}
