// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { act, cleanup, fireEvent, render, renderHook, screen } from '@testing-library/react';
import { NSEObject } from '../../../src/NSE/Objects/NSEObject';
import { observable } from '../../../src/NSE/Objects/observable';
import { bind } from '../../../src/NSE/Bindings/propertyBinding';
import { createNSEBinding } from '../../../src/NSE/Bindings/createNSEBinding';
import { useNSEBinding } from '../../../src/NSE/Bindings/useNSEBinding';
import { NSESwitch, NSETextField } from '../../../src/NSE/Controls/Fields/NSEFields';
import { NSEButton } from '../../../src/NSE/Controls/Buttons/NSEButton';
import { NSESearchField } from '../../../src/NSE/Controls/Fields/NSESearchField';
import { NSESlider } from '../../../src/NSE/Controls/Values/NSESlider';
import { NSEStepper } from '../../../src/NSE/Controls/Values/NSEStepper';
import { NSEControlRuntimeProvider } from '../../../src/NSE/Controls/Core/useNSEControlCommand';

class Values extends NSEObject {
  @observable accessor text = 'hello';
  @observable accessor checked = false;
  @observable accessor amount = 2;
  @observable accessor selection: boolean | 'mixed' = 'mixed';
}
afterEach(cleanup);
describe('bound controls', () => {
  it('shares property bindings between text and search fields without callback plumbing', () => {
    const owner = new Values();
    render(<><NSETextField aria-label="Text" binding={bind(owner, 'text')} /><NSESearchField aria-label="Search" binding={bind(owner, 'text')} /></>);
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'new' } });
    expect(owner.text).toBe('new');
    expect((screen.getByRole('textbox') as HTMLInputElement).value).toBe('new');
  });
  it('preserves native search composition and invokes query once', () => {
    const owner = new Values(); const queries: string[] = [];
    render(<NSESearchField aria-label="Search" binding={bind(owner, 'text')} onQuery={value => { queries.push(value); }} />);
    const input = screen.getByRole('searchbox');
    fireEvent.compositionStart(input); fireEvent.change(input, { target: { value: '日本' } });
    expect(queries).toEqual([]);
    fireEvent.compositionEnd(input, { data: '日本', target: { value: '日本' } });
    expect(owner.text).toBe('日本'); expect(queries).toEqual(['日本']);
  });
  it('updates checkbox and toggle through the same model', async () => {
    const owner = new Values();
    render(<><NSEButton buttonType="switch" title="Check" binding={bind(owner, 'checked')} /><NSESwitch aria-label="Toggle" binding={bind(owner, 'checked')} /></>);
    await act(async () => fireEvent.click(screen.getByRole('checkbox')));
    expect(owner.checked).toBe(true);
    expect(screen.getByRole('switch').getAttribute('aria-checked')).toBe('true');
  });
  it('shows a mixed bound selection as the mixed state and commits a Boolean when clicked', async () => {
    const owner = new Values();
    render(<NSEButton buttonType="switch" title="Selection" allowsMixedState binding={bind(owner, 'selection')} />);
    expect(screen.getByRole('checkbox').getAttribute('aria-checked')).toBe('mixed');
    await act(async () => fireEvent.click(screen.getByRole('checkbox')));
    expect(typeof owner.selection).toBe('boolean');
    expect(screen.getByRole('checkbox').getAttribute('aria-checked')).toBe(String(owner.selection));
  });
  it('uses canonical numeric control keyboard paths', async () => {
    const owner = new Values();
    render(<><NSESlider aria-label="Amount" minimum={0} maximum={10} binding={bind(owner, 'amount')} /><NSEStepper aria-label="Step" minimum={0} maximum={10} step={1} binding={bind(owner, 'amount')} /></>);
    await act(async () => fireEvent.keyDown(screen.getByRole('slider'), {key:'ArrowRight'}));
    expect(owner.amount).toBe(3);
  });
  it('rejects two value authorities for JavaScript consumers', () => {
    const owner = new Values();
    expect(() => render(<NSESearchField {...({binding:bind(owner,'text'),value:'other'} as any)} />)).toThrow(/binding/i);
  });
  it('keeps invalid transactional text visible and exposes its issue without committing the model',async()=>{
    const owner=new Values();const snapshot={revision:0,value:{kind:'value' as const,value:'hello'},readOnly:false,issues:[]};
    const binding=createNSEBinding<string>(owner,{source:owner,read:()=>snapshot,beginEditing:()=>({preview(){},cancel(){},async commit(){return{status:'invalid',issues:[{code:'required',message:'A title is required.'}]};}})});
    render(<NSETextField aria-label="Title" binding={binding}/>);
    const input=screen.getByRole('textbox');fireEvent.change(input,{target:{value:''}});
    await act(async()=>fireEvent.blur(input));
    expect(screen.getByRole('alert').textContent).toBe('A title is required.');expect(owner.text).toBe('hello');
  });
  it('cancels a bound drag while preserving a newer external value',()=>{
    const owner=new Values();render(<NSESlider aria-label="Drag" minimum={0} maximum={10} binding={bind(owner,'amount')}/>);
    const slider=screen.getByRole('slider');fireEvent.pointerDown(slider,{pointerId:1});fireEvent.change(slider,{target:{value:'7'}});expect(owner.amount).toBe(7);
    fireEvent.pointerCancel(slider,{pointerId:1});expect(owner.amount).toBe(2);
    fireEvent.pointerDown(slider,{pointerId:2});fireEvent.change(slider,{target:{value:'6'}});
    act(()=>{owner.amount=9;});fireEvent.pointerCancel(slider,{pointerId:2});expect(owner.amount).toBe(9);
  });
  it('cancels a held bound stepper without committing the preview',()=>{
    const owner=new Values();const timers=new Set<()=>void>();
    const port={signal:new AbortController().signal,scheduler:{setTimeout(callback:()=>void){timers.add(callback);return callback;},clearTimeout(callback:()=>void){timers.delete(callback);}},commands:{}} as any;
    render(<NSEControlRuntimeProvider port={port}><NSEStepper aria-label="Held step" minimum={0} maximum={10} step={1} binding={bind(owner,'amount')}/></NSEControlRuntimeProvider>);
    const increment=screen.getByRole('button',{name:'Increment Held step'});fireEvent.pointerDown(increment,{pointerId:1});expect(owner.amount).toBe(3);
    fireEvent.pointerCancel(increment,{pointerId:1});expect(owner.amount).toBe(2);expect(timers.size).toBe(0);
  });
  it('does not revive an obsolete editor when a source is replaced and later selected again',()=>{
    const first=new Values(),second=new Values();const one=bind(first,'text'),two=bind(second,'text');
    const hook=renderHook(({binding})=>useNSEBinding(binding),{initialProps:{binding:one}});
    const obsolete=hook.result.current.editor;hook.rerender({binding:two});hook.rerender({binding:one});
    act(()=>obsolete.preview('stale'));expect(first.text).toBe('hello');
    act(()=>hook.result.current.editor.preview('current'));expect(first.text).toBe('current');
  });
});
