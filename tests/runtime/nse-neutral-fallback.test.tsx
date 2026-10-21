// @vitest-environment jsdom
import React from 'react';
import { readFileSync } from 'node:fs';
import postcss from 'postcss';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { NSECheckbox, NSERadioGroup, NSEToggleButton } from '../../src/NSE/Controls/Fields/NSEFields';
import { NSESlider } from '../../src/NSE/Controls/Values/NSESlider';
import { NSEThemeProvider, neutralNSETheme } from '../../src/NSE/Appearance';

const source = readFileSync('src/NSE/Appearance/nse-neutral-controls.css', 'utf8');
const sheet = postcss.parse(source);
afterEach(cleanup);

describe('neutral control fallback contract (not rendered visual verification)', () => {
  it('ships only bounded neutral paint with explicit scope-root selectors', () => {
    expect(readFileSync('src/NSE/public/styles.css', 'utf8')).toContain('@import "../Appearance/nse-neutral-controls.css";');
    const scope = sheet.nodes.find(node => node.type === 'atrule' && node.name === 'scope');
    expect(scope && scope.type === 'atrule' && scope.params).toBe('([data-nse-theme="com.syndromatic.neutral"]) to ([data-nse-theme]:not([data-nse-theme="com.syndromatic.neutral"]))');
    sheet.walkRules(rule => {
      expect(rule.selector).toContain(':scope');
      expect(rule.selector).toContain('.nse-control-');
      let parent = rule.parent;
      while (parent && parent !== scope) parent = parent.parent;
      expect(parent).toBe(scope);
    });
    expect(source).not.toMatch(/@import|url\(|com\.syndromatic\.(?:atmo|metro)|font-family|!important/);
  });

  it('restores native check/radio paint, slider fill and thumb, and keyboard focus', () => {
    const rules = sheet.nodes.flatMap(node => node.type === 'atrule' && node.name === 'scope' ? node.nodes ?? [] : []);
    const declarations = (fragment: string) => rules.filter(node => node.type === 'rule' && node.selector.includes(fragment)).flatMap(node => node.type === 'rule' ? node.nodes : []).filter(node => node.type === 'decl').map(node => `${node.prop}:${node.value}`);
    expect(declarations('.nse-control-checkbox input:where')).toEqual(expect.arrayContaining(['appearance:auto', 'opacity:1', 'clip:auto', 'position:static', 'inline-size:18px']));
    expect(declarations('.nse-control-radio > input:where')).toContain('appearance:auto');
    expect(declarations('.nse-control-slider-fill:where')).toEqual(expect.arrayContaining(['display:block', 'inline-size:var(--nse-control-slider-progress, 0%)', 'background:Highlight']));
    expect(declarations('.nse-control-slider-thumb-visual:where')).toContain('height:20px');
    expect(declarations(':focus-visible')).toContain('outline:2px solid Highlight');
    expect(declarations('.nse-control-toggle:disabled:where')).toContain('color:GrayText');
  });

  it('retains native mixed/disabled states and keyboard-backed slider/switch contracts', () => {
    render(<NSEThemeProvider theme={neutralNSETheme}>
      <NSECheckbox label="Mixed" defaultState="mixed" />
      <NSECheckbox label="Disabled" defaultChecked disabled />
      <NSERadioGroup label="Choice" options={[{value:'a',label:'Alpha'},{value:'b',label:'Beta',disabled:true}]} />
      <NSESlider label="Amount" minimum={0} maximum={100} defaultValue={40} />
      <NSEToggleButton aria-label="Enabled" />
    </NSEThemeProvider>);
    const mixed = screen.getByRole('checkbox', {name:'Mixed'}) as HTMLInputElement;
    expect(mixed.indeterminate).toBe(true);
    expect(mixed.getAttribute('aria-checked')).toBe('mixed');
    const disabled = screen.getByRole('checkbox', {name:'Disabled'}) as HTMLInputElement;
    expect(disabled.disabled).toBe(true);
    expect(disabled.checked).toBe(true);
    expect((screen.getByRole('radio', {name:'Alpha'}) as HTMLInputElement).checked).toBe(true);
    expect((screen.getByRole('radio', {name:'Beta'}) as HTMLInputElement).disabled).toBe(true);
    const slider = screen.getByRole('slider', {name:'Amount'}) as HTMLInputElement;
    expect(slider.value).toBe('40');
    expect(slider.closest('.nse-control-slider')?.getAttribute('style')).toContain('--nse-control-slider-progress: 40%');
    const toggle = screen.getByRole('switch', {name:'Enabled'});
    fireEvent.keyDown(toggle, {key:'End'});
    expect(toggle.getAttribute('aria-checked')).toBe('true');
    expect(toggle.getAttribute('style')).toContain('--nse-control-toggle-ratio: 1');
  });
});
