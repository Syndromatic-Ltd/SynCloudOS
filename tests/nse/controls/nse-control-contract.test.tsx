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
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NSERadioGroup, NSETextField } from "../../../src/NSE/Controls/Fields/NSEFields";
import { ControlRuntimeProvider, useNSEControlCommand } from "../../../src/NSE/Controls/Core";
import { NSEButton } from "../../../src/NSE/Controls/Buttons/NSEButton";

afterEach(cleanup);

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
  string: (value: number) => String(value),
  editingString: (value: number) => String(value),
  getObjectValue: (text: string) => /^\d+$/.test(text)
    ? { ok: true as const, value: Number(text) }
    : { ok: false as const, error: { code: "not-an-integer", message: "Enter an integer.", input: text } },
  isPartialStringValid: (text: string) => ({ valid: text === "" || /^\d+$/.test(text) }),
};

describe("NSE control contracts", () => {
  it("prepares current availability for a custom sender even before its cached presentation updates", async () => {
    let allowed = false;
    const dispatch = vi.fn(async () => ({ status: "executed" as const, commandId: "current", responderId: "form", operationId: "op", correlationId: "c", value: undefined }));
    const port = { signal: new AbortController().signal, commands: {
      getPresentationGeneration: () => ({ registryGeneration: 0, responderGeneration: 0 }),
      validate: async () => ({ commandId: "current", responderId: "form", title: "Current", enabled: allowed, denied: false, hidden: false, state: "off" as const, stale: false }),
      prepareDispatch: async () => allowed ? { status: "accepted" as const, acceptance: { commandId: "current", responderId: "form" } as never } : { status: "disabled" as const, reason: "Disabled" },
      dispatch,
    } };
    function Probe() {
      const binding = useMemo(() => ({ id: "current" }), []);
      const command = useNSEControlCommand(binding, port);
      return <button onClick={() => void command.dispatch()}>{command.presentation ? "Ready" : "Validating"}</button>;
    }
    render(<Probe />);
    await screen.findByRole("button", { name: "Ready" });
    fireEvent.click(screen.getByRole("button", { name: "Ready" }));
    await act(async () => {});
    expect(dispatch).not.toHaveBeenCalled();
    allowed = true;
    fireEvent.click(screen.getByRole("button", { name: "Ready" }));
    await waitFor(() => expect(dispatch).toHaveBeenCalledOnce());
  });

  it("releases validation abort listeners after each successful refresh", async () => {
    const owner = new AbortController();
    const add = vi.spyOn(owner.signal, "addEventListener");
    const remove = vi.spyOn(owner.signal, "removeEventListener");
    const port = { signal: owner.signal, commands: {
      getPresentationGeneration: () => ({ registryGeneration: 0, responderGeneration: 0 }),
      validate: async () => ({ commandId: "refresh", responderId: "form", title: "Refresh", enabled: true, denied: false, hidden: false, state: "off" as const, stale: false }),
      prepareDispatch: vi.fn(), dispatch: vi.fn(),
    } };
    function Probe() {
      const binding = useMemo(() => ({ id: "refresh" }), []);
      const command = useNSEControlCommand(binding, port);
      return <button onClick={command.refresh}>Refresh validation</button>;
    }
    const view = render(<Probe />);
    await waitFor(() => expect(remove.mock.calls.length).toBe(add.mock.calls.length));
    for (let index = 0; index < 3; index++) {
      fireEvent.click(screen.getByRole("button", { name: "Refresh validation" }));
      await waitFor(() => expect(remove.mock.calls.length).toBe(add.mock.calls.length));
    }
    expect(add).toHaveBeenCalled();
    view.unmount();
  });

  it("reflects a radio option's canonical command availability", async () => {
    const validate = vi.fn(async () => ({ commandId: "radio.choose", responderId: "form", title: "Restricted", enabled: false, denied: true, hidden: false, state: "off" as const, stale: false }));
    const port = { signal: new AbortController().signal, commands: {
      getPresentationGeneration: () => ({ registryGeneration: 0, responderGeneration: 0 }), validate,
      prepareDispatch: vi.fn(), dispatch: vi.fn(),
    } };
    render(<ControlRuntimeProvider port={port}><NSERadioGroup label="Choice" options={[{ value: "restricted", label: "Restricted", command: { id: "radio.choose" } }]} /></ControlRuntimeProvider>);
    await waitFor(() => expect(validate).toHaveBeenCalled());
    await waitFor(() => expect((screen.getByRole("radio", { name: "Restricted" }) as HTMLInputElement).disabled).toBe(true));
  });

  it.each(["a", "b"])("skips command-disabled radios for arrows and the tab stop with %s selected", async selected => {
    const change = vi.fn();
    const port = { signal: new AbortController().signal, commands: {
      getPresentationGeneration: () => ({ registryGeneration: 0, responderGeneration: 0 }),
      validate: async () => ({ commandId: "radio.choose", responderId: "form", title: "B", enabled: false, denied: true, hidden: false, state: "off" as const, stale: false }),
      prepareDispatch: vi.fn(), dispatch: vi.fn(),
    } };
    render(<ControlRuntimeProvider port={port}><NSERadioGroup label="Navigation" defaultValue={selected} onValueChange={change} options={[{ value: "a", label: "A" }, { value: "b", label: "B", command: { id: "radio.choose" } }, { value: "c", label: "C" }]} /></ControlRuntimeProvider>);
    const a = screen.getByRole("radio", { name: "A" }) as HTMLInputElement;
    await waitFor(() => expect((screen.getByRole("radio", { name: "B" }) as HTMLInputElement).disabled).toBe(true));
    await waitFor(() => expect(a.tabIndex).toBe(0));
    a.focus();
    fireEvent.keyDown(a, { key: "ArrowRight" });
    await waitFor(() => expect(change).toHaveBeenCalledWith("c", "commit"));
    expect(document.activeElement).toBe(screen.getByRole("radio", { name: "C" }));
  });

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
      <ControlRuntimeProvider port={port}>
        <NSETextField label="Command title" defaultValue="Base" command={{ id: "title.set", payload: "Base" }} onValueChange={changes} />
        <NSEButton
          buttonType="switch"
          title="Command checkbox"
          defaultState="off"
          onStateChange={(state) => checkboxChanges(state === "on")}
          action="flag.set"
          actionPayload={true}
        />
        <NSERadioGroup
          label="Command radio"
          defaultValue="first"
          options={[
            { value: "first", label: "First" },
            { value: "second", label: "Second", command: { id: "choice.set", payload: { value: "second" } } },
          ]}
          onValueChange={radioChanges}
        />
      </ControlRuntimeProvider>,
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
        <NSETextField label="Disabled amount" defaultValue="8" isEnabled={false} />
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

  it("sizes the push button as NSControl does: regular or small", () => {
    render(<><NSEButton title="Regular" /><NSEButton title="Small" controlSize="small" style={{ marginTop: 4 }} /></>);
    expect(screen.getByRole("button", { name: "Regular" }).hasAttribute("data-size")).toBe(false);
    const small = screen.getByRole("button", { name: "Small" });
    expect(small.getAttribute("data-size")).toBe("small");
    expect(small.style.marginTop).toBe("4px");
  });

  it("validates and dispatches through the injected command authority", async () => {
    const dispatch = vi.fn(async () => ({ status: "executed" as const, commandId: "amount.increment", responderId: "amount-control", operationId: "op", correlationId: "correlation", value: undefined }));
    render(<CommandFixture onDispatch={dispatch} />);

    const button = screen.getByRole("button", { name: "Increment amount" }) as HTMLButtonElement;
    await waitFor(() => expect(button.disabled).toBe(false));
    fireEvent.click(button);
    await waitFor(() => expect(dispatch).toHaveBeenCalledWith("amount.increment", { delta: 1 }, expect.objectContaining({ source: "api" })));
  });

  it("keeps activation live across an equivalent presentation refresh", async () => {
    let refresh!: () => void;
    let responderGeneration = 0;
    const dispatch = vi.fn(async () => ({ status: "executed" as const, commandId: "amount.increment", responderId: "amount-control", operationId: "test", correlationId: "test", value: undefined }));
    const port = {
      signal: new AbortController().signal,
      commands: {
        getPresentationGeneration: () => ({ registryGeneration: 0, responderGeneration }),
        validate: async () => ({ commandId: "amount.increment", responderId: "amount-control", title: "Increment", enabled: true, denied: false, hidden: false, state: "off" as const, stale: false }),
        prepareDispatch: async () => { refresh(); return { status: "accepted" as const, acceptance: { commandId: "amount.increment", responderId: "amount-control" } as never }; },
        dispatch,
      },
    };
    const binding = { id: "amount.increment" };
    function Control() {
      const command = useNSEControlCommand(binding, port);
      refresh = command.refresh;
      return <button disabled={!command.presentation?.enabled} onClick={() => void command.dispatch()}>Current action</button>;
    }
    render(<Control />);
    const button = screen.getByRole("button", { name: "Current action" }) as HTMLButtonElement;
    await waitFor(() => expect(button.disabled).toBe(false));
    responderGeneration += 1;
    fireEvent.click(button);
    await waitFor(() => expect(dispatch).toHaveBeenCalledOnce());
  });

  it.each(["same-target", "changed-target", "changed-command"] as const)("uses canonical acceptance across popup focus restoration: %s", async change => {
    let registryGeneration = 0, responderGeneration = 0;
    const dispatch = vi.fn(async () => ({ status: "executed" as const, commandId: "amount.increment", responderId: "form", operationId: "op", correlationId: "c", value: undefined }));
    const port = { signal: new AbortController().signal, commands: {
      getPresentationGeneration: () => ({ registryGeneration, responderGeneration }),
      validate: async () => ({ commandId: "amount.increment", responderId: "form", title: "Select", enabled: true, denied: false, hidden: false, state: "off" as const, stale: false }),
      prepareDispatch: async () => {
        responderGeneration++;
        if (change === "changed-command") registryGeneration++;
        return { status: "accepted" as const, acceptance: { commandId: "amount.increment", responderId: change === "changed-target" ? "other" : "form" } as never };
      }, dispatch,
    } };
    function Probe() {
      const binding = useMemo(() => ({ id: "amount.increment" }), []);
      const command = useNSEControlCommand(binding, port);
      return <button onClick={() => void command.dispatch()}>Select option</button>;
    }
    render(<Probe />);
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Select option" })); });
    expect(dispatch).toHaveBeenCalledTimes(change === "same-target" ? 1 : 0);
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
