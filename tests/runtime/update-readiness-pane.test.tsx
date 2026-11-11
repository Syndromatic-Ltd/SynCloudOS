// @vitest-environment jsdom
import * as React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, within, waitFor } from '@testing-library/react';
import { SynCloudOSProvider, RuntimeInputBoundary } from '../../src/SynCloudOSReact';
import { SystemUILayer } from '../../src/Webspring/SystemUILayer';
import { UpdateReadinessDetails } from '../../src/Webspring/Preferences/Updates.prefPane';
import { createTestRuntime } from './helpers';
import { initialHostUpdateReadinessSnapshot } from '../../src/SynCloudOS/Updates';

const runtimes: ReturnType<typeof createTestRuntime>[] = [];
afterEach(async () => { cleanup(); vi.restoreAllMocks(); for (const runtime of runtimes.splice(0)) await runtime.dispose('generated pane test'); });
function fixture(options: Parameters<typeof createTestRuntime>[0] = {}) {
  const runtime = createTestRuntime({ authenticationPolicy: 'disabled', ...options }); runtimes.push(runtime); runtime.store.mutate(draft => { draft.booted = true; });
  const view = render(<SynCloudOSProvider runtime={runtime}><RuntimeInputBoundary><SystemUILayer /></RuntimeInputBoundary></SynCloudOSProvider>);
  act(() => runtime.systemUI.preferences.open('updates')); return { runtime, ...view };
}
describe('read-only Updates preference pane', () => {
  it('returns focus to the runtime-owned shell trigger after the preferences owner actually closes', async () => {
    const runtime = createTestRuntime({ authenticationPolicy: 'disabled' }); runtimes.push(runtime);
    runtime.store.mutate(draft => { draft.booted = true; });
    render(<SynCloudOSProvider runtime={runtime}><RuntimeInputBoundary><button data-syncloudos-runtime-owner={runtime.runtimeId}>Generated preferences trigger</button><SystemUILayer /></RuntimeInputBoundary></SynCloudOSProvider>);
    const trigger = screen.getByRole('button', { name: 'Generated preferences trigger' }); trigger.focus();
    act(() => runtime.systemUI.preferences.open('updates'));
    const inspect = screen.getByRole('button', { name: 'Inspect current work' }); inspect.focus();fireEvent.keyDown(inspect, { key: 'Escape' });
    const dialog = screen.getByRole('dialog', { name: 'System Preferences' });fireEvent.keyDown(dialog, { key: 'Escape' });
    await waitFor(() => expect(runtime.systemUI.preferences.isOpen()).toBe(false));
    await waitFor(() => expect(document.activeElement).toBe(trigger));
  });
  it('retains keyboard focus on the stable preferences owner when leaving a pane', () => {
    const { runtime } = fixture(); const dialog = screen.getByRole('dialog', { name: 'Updates' });
    const inspect = screen.getByRole('button', { name: 'Inspect current work' }); inspect.focus();
    fireEvent.keyDown(inspect, { key: 'Escape' });
    expect(document.activeElement).toBe(dialog);
    fireEvent.keyDown(dialog, { key: 'Escape' });
    expect(runtime.systemUI.preferences.isOpen()).toBe(false);
  });
  it('shows incomplete coverage, known counts and compatibility independently, with no activation action', () => {
    fixture(); const dialog = screen.getByRole('dialog', { name: 'Updates' });
    expect(within(dialog).getByRole('status').textContent).toContain('Some work cannot be inspected');
    expect(within(dialog).getByRole('heading', { name: 'Inspection coverage' })).toBeTruthy();
    expect(within(dialog).getByText('No replacement build or storage compatibility has been verified.')).toBeTruthy();
    expect(within(dialog).getByText('Other windows have not been inspected.')).toBeTruthy();
    expect(within(dialog).queryByRole('button', { name: /update now|install|reload|activate/i })).toBeNull();
    expect(within(dialog).queryByRole('button', { name: 'Inspect other windows' })).toBeNull();
    expect(within(dialog).getByText('Native file writes and permission requests')).toBeTruthy();
  });
  it('inspects existing facts without changing settings or saving/settling documents', () => {
    const { runtime } = fixture(); const set = vi.spyOn(runtime.settings, 'set'), inspect = vi.spyOn(runtime.updateReadiness, 'inspect');
    fireEvent.click(screen.getByRole('button', { name: 'Inspect current work' })); expect(inspect).toHaveBeenCalledOnce(); expect(set).not.toHaveBeenCalled();
  });
  it('announces pending observed work and returns to incomplete coverage after actual lease release', async () => {
    const { runtime } = fixture(); let settle!: () => void; let pending!: Promise<void>;
    act(() => { pending = runtime.nativeActivity.track(() => new Promise<void>(resolve => { settle = resolve; })); });
    expect(screen.getByRole('status').textContent).toBe('Work is still in progress');
    await act(async () => { settle(); await pending; }); expect(screen.getByRole('status').textContent).toBe('Some work cannot be inspected');
  });
  it('renders configured participant observations as historical facts while local coverage still defers', async () => {
    fixture({ updateReadiness: { compatibilityRestricted: true, inspectParticipants: async () => ({ status: 'ready-at-observation', activationAuthorized: false, participantCount: 2, reasons: [] }) } });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Inspect other windows' })); });
    expect(screen.getByText('The inspected participants reported no blocking work at that observation.')).toBeTruthy();
    expect(screen.getByText('The host restricts update compatibility.')).toBeTruthy();
    expect(screen.getByRole('status').textContent).toBe('Some work cannot be inspected');
    expect(screen.queryByRole('button', { name: /update now|reload|install/i })).toBeNull();
  });
  it('exposes deferral and stale evidence separately from a ready observation', async () => {
    const { runtime } = fixture({ updateReadiness: { inspectParticipants: async () => ({ status: 'defer', activationAuthorized: false, participantCount: 3, reasons: ['client-blocked'] }) } });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Inspect other windows' })); });
    expect(screen.getByText('The inspected participants require deferral.')).toBeTruthy();
    act(() => { runtime.store.mutate(draft => { draft.loginServices.sessionId = 'changed-generated-session'; }); });
    expect(screen.getByText(/previous observation is stale/i)).toBeTruthy();
  });
  it('keeps unknown/ready observation wording conservative in the standalone presentation', () => {
    const runtime = createTestRuntime(); runtimes.push(runtime);
    const snapshot = initialHostUpdateReadinessSnapshot();
    render(<SynCloudOSProvider runtime={runtime}><UpdateReadinessDetails snapshot={{ ...snapshot, inspection: { available: true, state: 'observed', observedAt: 1, sourceGeneration: 1, reason: null, result: { status: 'ready-at-observation', activationAuthorized: false, participantCount: 2, reasons: [] } } }} /></SynCloudOSProvider>);
    expect(screen.getByText(/not permission to activate or reload/i)).toBeTruthy(); expect(screen.queryByText(/ready to update/i)).toBeNull();
  });
});
