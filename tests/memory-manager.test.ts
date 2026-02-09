import { describe, it, expect } from 'vitest';
import { MemoryManager } from '../src/utils/memory-manager';

describe('MemoryManager', () => {
  it('can be constructed', () => {
    const mm = new MemoryManager();
    expect(mm).toBeDefined();
  });

  it('disposeAll does not throw on empty manager', () => {
    const mm = new MemoryManager();
    expect(() => mm.disposeAll()).not.toThrow();
  });

  it('tracks and disposes mock objects', () => {
    const mm = new MemoryManager();
    let disposed = false;
    const mockTexture = { dispose: () => { disposed = true; } };
    mm.trackTexture(mockTexture as never);
    mm.disposeAll();
    expect(disposed).toBe(true);
  });

  it('yieldToGC resolves', async () => {
    await expect(MemoryManager.yieldToGC()).resolves.toBeUndefined();
  });
});
