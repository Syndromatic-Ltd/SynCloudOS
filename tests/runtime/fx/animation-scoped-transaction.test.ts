import { describe, expect, it, vi } from 'vitest';
import { AFXTransaction, currentAFXTransactionActionContext } from '../../../src/FX/AnimationFX/AFXTransaction';

describe('scoped layer transaction',()=>{
  it('inherits outer timing and restores it after a nested override',()=>{
    AFXTransaction.perform({duration:0.7,delay:0.2,timing:'linear'},()=>{
      expect(currentAFXTransactionActionContext()).toMatchObject({duration:0.7,delay:0.2,timing:'linear'});
      AFXTransaction.perform({disableActions:true},()=>expect(currentAFXTransactionActionContext()).toMatchObject({duration:0.7,disableActions:true}));
      expect(AFXTransaction.disableActions()).toBe(false);
    });
    expect(currentAFXTransactionActionContext()).toBeNull();
  });
  it('commits once and rethrows the application error',()=>{
    const commit=vi.spyOn(AFXTransaction,'commit');const error=Error('application');
    expect(()=>AFXTransaction.perform({},()=>{throw error;})).toThrow(error);
    expect(commit).toHaveBeenCalledTimes(1);expect(currentAFXTransactionActionContext()).toBeNull();commit.mockRestore();
  });
  it('validates all options before opening a transaction',()=>{
    const begin=vi.spyOn(AFXTransaction,'begin');
    expect(()=>AFXTransaction.perform({duration:-1},()=>{})).toThrow();
    expect(()=>AFXTransaction.perform({delay:Infinity},()=>{})).toThrow();
    expect(()=>AFXTransaction.perform({timing:'invalid' as never},()=>{})).toThrow();
    expect(begin).not.toHaveBeenCalled();begin.mockRestore();
  });
  it('rejects async callbacks without invoking them and closes thenable-returning callbacks',()=>{
    let writes=0;
    expect(()=>AFXTransaction.perform({},(async()=>{writes++;}) as any)).toThrow(/synchronous/i);expect(writes).toBe(0);
    expect(()=>AFXTransaction.perform({},(()=>({then(){}})) as any)).toThrow(/synchronous/i);
    expect(currentAFXTransactionActionContext()).toBeNull();
  });
});
