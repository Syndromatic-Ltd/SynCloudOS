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

// @vitest-environment jsdom
import React, { useMemo, useState } from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { NSECheckbox, NSERadioGroup, NSETextField } from "../../../src/NSE/Controls/Fields/NSEFields";
import { NSEControlRuntimeProvider, useNSEControlCommand } from "../../../src/NSE/Controls/Core";
import { NSEPushButton } from "../../../src/NSE/Controls/Buttons/NSEButtons";

function CommandFixture({ onDispatch }: { readonly onDispatch: ReturnType<typeof vi.fn> }) {
  const binding = useMemo(() => ({
    id: "amount.increment",
    payload: { delta: 1 },
    responderId: "amount-control",
  }), []);
  const port = useMemo(() => ({
    signal: new AbortController().signal,
    commands: {
      getPresentationGeneration: () => ({ registryGeneration: 0, responderGeneration: 0 }),
      validate: vi.fn(async () => ({
        commandId: "amount.increment",
        responderId: "amount-control",
        title: "Increment amount",
        enabled: true,
        denied: false,
        hidden: false,
        state: "off",
      })),
      prepareDispatch: vi.fn(async (commandId: string) => ({ status: "accepted" as const, acceptance: { commandId, responderId: "amount-control" } as never })),
      dispatch: onDispatch,
    },
  }), [onDispatch]);
  const command = useNSEControlCommand(binding, port);
  return <button type="button" disabled={!command.presentation?.enabled} onClick={() => void command.dispatch()}>Increment amount</button>;
}

function PendingCommandFixture({ prepareDispatch, onDispatch }: {
  readonly prepareDispatch: ReturnType<typeof vi.fn>;
  readonly onDispatch: ReturnType<typeof vi.fn>;
}) {
  const binding = useMemo(() => ({ id: "amount.increment", payload: { delta: 1 } }), []);
  const port = useMemo(() => ({
    signal: new AbortController().signal,
    commands: {
      getPresentationGeneration: () => ({ registryGeneration: 0, responderGeneration: 0 }),
      validate: vi.fn(async () => ({
        commandId: "amount.increment", responderId: "amount-control", title: "Increment", enabled: true,
        denied: false, hidden: false, state: "off" as const, stale: false,
      })),
      prepareDispatch,
      dispatch: onDispatch,
    },
  }), [onDispatch, prepareDispatch]);
  const command = useNSEControlCommand(binding, port);
  return <button type="button" disabled={!command.presentation?.enabled} onClick={() => void command.dispatch()}>Pending command</button>;
}

const integerFormatter = {
  format: (value: number) => String(value),
  editingText: (value: number) => String(value),
  parse: (text: string) => /^\d+$/.test(text)
    ? { ok: true as const, value: Number(text) }
    : { ok: false as const, error: { code: "not-an-integer", message: "Enter an integer.", input: text } },
  validatePartial: (text: string) => ({ valid: text === "" || /^\d+$/.test(text) }),
};

describe("NSE control contracts", () => {
  it("does not commit text, checkbox, or radio values when command declines the accepted dispatch", async () => {
    const changes = vi.fn();
    const checkboxChanges = vi.fn();
    const radioChanges = vi.fn();
    const dispatch = vi.fn(async (commandId: string) => ({
      status: "denied" as const,
      commandId,
      responderId: "form",
      reason: "Policy denied the command",
    }));
    const port = {
      signal: new AbortController().signal,
      commands: {
        getPresentationGeneration: () => ({ registryGeneration: 0, responderGeneration: 0 }),
        validate: vi.fn(async (commandId: string) => ({
          commandId,
          responderId: "form",
          title: commandId,
          enabled: true,
          denied: false,
          hidden: false,
          state: "off" as const,
          stale: false,
        })),
        prepareDispatch: vi.fn(async (commandId: string) => ({ status: "accepted" as const, acceptance: { commandId, responderId: "form" } as never })),
        dispatch,
      },
    };
    render(
      <NSEControlRuntimeProvider port={port}>
        <NSETextField label="Command title" defaultValue="Base" command={{ id: "title.set", payload: "Base" }} onValueChange={changes} />
        <NSECheckbox label="Command checkbox" defaultChecked={false} command={{ id: "flag.set", payload: true }} onCheckedChange={checkboxChanges} />
        <NSERadioGroup
          label="Command radio"
          defaultValue="first"
          options={[
            { value: "first", label: "First" },
            { value: "second", label: "Second", command: { id: "choice.set", payload: { value: "second" } } },
          ]}
          onValueChange={radioChanges}
        />
      </NSEControlRuntimeProvider>,
    );
    await waitFor(() => expect(port.commands.validate).toHaveBeenCalled());

    const text = screen.getByRole("textbox", { name: "Command title" });
    fireEvent.change(text, { target: { value: "Denied" } });
    fireEvent.keyDown(text, { key: "Enter" });
    fireEvent.click(screen.getByRole("checkbox", { name: "Command checkbox" }));
    fireEvent.click(screen.getByRole("radio", { name: "Second" }));
    await waitFor(() => expect(dispatch).toHaveBeenCalled());

    expect(changes.mock.calls).not.toContainEqual(["Denied", "commit"]);
    expect(checkboxChanges).not.toHaveBeenCalled();
    expect(radioChanges).not.toHaveBeenCalled();
  });

  it("restores the committed uncontrolled text baseline and rendered DOM on Escape", () => {
    const changes = vi.fn();
    render(<NSETextField label="Draft title" defaultValue="Committed" onValueChange={changes} />);
    const input = screen.getByRole("textbox", { name: "Draft title" }) as HTMLInputElement;

    fireEvent.change(input, { target: { value: "Preview" } });
    expect(input.value).toBe("Preview");
    fireEvent.keyDown(input, { key: "Escape" });

    expect(input.value).toBe("Committed");
    expect(changes).toHaveBeenLastCalledWith("Committed", "cancel");
    fireEvent.blur(input);
    expect(changes).not.toHaveBeenCalledWith("Preview", "commit");
  });

  it("does not treat Escape during IME composition as an edit cancellation", () => {
    const changes = vi.fn();
    render(<NSETextField label="Composed title" defaultValue="Base" onValueChange={changes} />);
    const input = screen.getByRole("textbox", { name: "Composed title" }) as HTMLInputElement;

    fireEvent.compositionStart(input);
    fireEvent.change(input, { target: { value: "編集中" } });
    fireEvent.keyDown(input, { key: "Escape", isComposing: true });

    expect(input.value).toBe("編集中");
    expect(changes).not.toHaveBeenCalledWith(expect.anything(), "cancel");
  });

  it("keeps value phases, native reset, disabled/read-only distinction, and linked validation native", () => {
    const changes = vi.fn();
    render(
      <form aria-label="amount form">
        <NSETextField
          label="Amount"
          name="amount"
          defaultValue="4"
          validation={{ kind: "invalid", code: "amount", message: "Amount is required." }}
          onValueChange={changes}
        />
        <NSETextField label="Read-only amount" defaultValue="7" readOnly />
        <NSETextField label="Disabled amount" defaultValue="8" disabled />
      </form>,
    );

    const form = screen.getByRole("form", { name: "amount form" }) as HTMLFormElement;
    const amount = screen.getByRole("textbox", { name: "Amount" }) as HTMLInputElement;
    const readOnly = screen.getByRole("textbox", { name: "Read-only amount" }) as HTMLInputElement;
    const disabled = screen.getByRole("textbox", { name: "Disabled amount" }) as HTMLInputElement;
    fireEvent.change(amount, { target: { value: "5" } });
    fireEvent.keyDown(amount, { key: "Enter" });

    expect(amount.value).toBe("5");
    expect(changes).toHaveBeenCalledWith("5", "preview");
    expect(changes).toHaveBeenCalledWith("5", "commit");
    expect(readOnly.readOnly).toBe(true);
    expect(readOnly.disabled).toBe(false);
    expect(disabled.disabled).toBe(true);
    expect(amount.getAttribute("aria-invalid")).toBe("true");
    expect(document.getElementById(amount.getAttribute("aria-describedby") ?? "")?.textContent).toBe("Amount is required.");

    form.reset();
    expect(amount.value).toBe("4");
  });

  it("keeps formatter validation IME-safe and commits only parsed values", () => {
    const changes = vi.fn();
    render(
      <NSETextField
        label="Quantity"
        defaultValue={4}
        formatter={integerFormatter}
        formatterContext={{ locale: "en-GB" }}
        onValueChange={changes}
      />,
    );

    const quantity = screen.getByRole("textbox", { name: "Quantity" }) as HTMLInputElement;
    fireEvent.compositionStart(quantity);
    fireEvent.change(quantity, { target: { value: "12x" } });
    expect(changes).not.toHaveBeenCalled();
    fireEvent.compositionEnd(quantity, { data: "x" });
    fireEvent.keyDown(quantity, { key: "Enter" });
    expect(quantity.getAttribute("aria-invalid")).toBe("true");

    fireEvent.change(quantity, { target: { value: "12" } });
    fireEvent.keyDown(quantity, { key: "Enter" });
    expect(changes).toHaveBeenCalledWith(12, "commit");
    fireEvent.keyDown(quantity, { key: "Escape" });
    expect(changes).toHaveBeenCalledWith(12, "cancel");
  });

  it("claims Escape only when a text field has an edit to revert", () => {
    const changes = vi.fn();
    render(<NSETextField label="Name" defaultValue="Ada" onValueChange={changes} />);
    const name = screen.getByRole("textbox", { name: "Name" }) as HTMLInputElement;
    const clean = new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true });
    act(() => { name.dispatchEvent(clean); });
    expect(clean.defaultPrevented).toBe(false);
    expect(changes).toHaveBeenCalledWith("Ada", "cancel");
    fireEvent.change(name, { target: { value: "Ad" } });
    const dirty = new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true });
    act(() => { name.dispatchEvent(dirty); });
    expect(dirty.defaultPrevented).toBe(true);
    expect(name.value).toBe("Ada");
  });

  it("carries AppKit control sizes to the themed field and slider", () => {
    render(<><NSETextField label="Small" controlSize="small" /><NSETextField label="Regular" /></>);
    expect(screen.getByRole("textbox", { name: "Small" }).closest("label")?.getAttribute("data-size")).toBe("small");
    expect(screen.getByRole("textbox", { name: "Regular" }).closest("label")?.getAttribute("data-size")).toBe("regular");
  });

  it("sizes the push button as NSControl does: regular, small, or an explicit band height", () => {
    render(<><NSEPushButton>Regular</NSEPushButton><NSEPushButton controlSize="small">Small</NSEPushButton><NSEPushButton height={32} style={{ marginTop: 4 }}>Custom</NSEPushButton></>);
    expect(screen.getByRole("button", { name: "Regular" }).hasAttribute("data-size")).toBe(false);
    expect(screen.getByRole("button", { name: "Small" }).getAttribute("data-size")).toBe("small");
    const custom = screen.getByRole("button", { name: "Custom" });
    expect(custom.getAttribute("data-size")).toBe("custom");
    expect(custom.style.getPropertyValue("--nse-control-height")).toBe("32px");
    expect(custom.style.marginTop).toBe("4px");
  });

  it("validates and dispatches through the injected command authority", async () => {
    const dispatch = vi.fn(async () => ({ status: "executed" as const, commandId: "amount.increment", responderId: "amount-control", operationId: "op", correlationId: "correlation", value: undefined }));
    render(<CommandFixture onDispatch={dispatch} />);

    const button = screen.getByRole("button", { name: "Increment amount" }) as HTMLButtonElement;
    await waitFor(() => expect(button.disabled).toBe(false));
    fireEvent.click(button);
    await waitFor(() => expect(dispatch).toHaveBeenCalledWith("amount.increment", { delta: 1 }, expect.objectContaining({ source: "api" })));
  });

  it("does not consume an accepted command after its control unmounts", async () => {
    let resolveAcceptance!: (value: { readonly status: "accepted"; readonly acceptance: never }) => void;
    const prepareDispatch = vi.fn(() => new Promise<{ readonly status: "accepted"; readonly acceptance: never }>((resolve) => {
      resolveAcceptance = resolve;
    }));
    const dispatch = vi.fn();
    const view = render(<PendingCommandFixture prepareDispatch={prepareDispatch} onDispatch={dispatch} />);
    const button = screen.getByRole("button", { name: "Pending command" }) as HTMLButtonElement;
    await waitFor(() => expect(button.disabled).toBe(false));
    fireEvent.click(button);
    await waitFor(() => expect(prepareDispatch).toHaveBeenCalledOnce());

    view.unmount();
    resolveAcceptance({ status: "accepted", acceptance: { commandId: "amount.increment", responderId: "amount-control" } as never });
    await Promise.resolve();
    await Promise.resolve();

    expect(dispatch).not.toHaveBeenCalled();
  });
});
