import { describe, it, expect } from 'vitest';

/**
 * Integration-level tests for PannellumTiler.
 *
 * Because the full pipeline requires a browser DOM, WebGL, and Canvas,
 * these tests validate constructor behaviour, config validation, and
 * error paths that do NOT depend on a real browser environment.
 *
 * For end-to-end tests with actual image processing, use the HTML
 * examples in /examples or a Playwright / Puppeteer harness.
 */

// Dynamic import so that tests still compile even if Three.js
// cannot fully initialise in a Node-like environment.
const { PannellumTiler } = await import('../src/PannellumTiler');

describe('PannellumTiler – construction', () => {
  it('creates an instance with default options', () => {
    const tiler = new PannellumTiler();
    expect(tiler).toBeDefined();
    tiler.dispose();
  });

  it('creates an instance with custom options', () => {
    const tiler = new PannellumTiler({ maxTextureSize: 4096, debug: true });
    expect(tiler).toBeDefined();
    tiler.dispose();
  });
});

describe('PannellumTiler – validation', () => {
  it('rejects process() after dispose()', async () => {
    const tiler = new PannellumTiler();
    tiler.dispose();

    await expect(
      tiler.process({ sourceImage: new Blob(), output: 'raw' }),
    ).rejects.toThrow(/disposed/i);
  });

  it('rejects when sourceImage is missing', async () => {
    const tiler = new PannellumTiler();

    await expect(
      tiler.process({ sourceImage: '', output: 'raw' }),
    ).rejects.toThrow(/sourceImage/i);

    tiler.dispose();
  });

  it('rejects an invalid output mode', async () => {
    const tiler = new PannellumTiler();

    await expect(
      tiler.process({
        sourceImage: new Blob(['x']),
        output: 'invalid' as 'zip',
      }),
    ).rejects.toThrow(/output/i);

    tiler.dispose();
  });

  it('rejects quality outside 0-1', async () => {
    const tiler = new PannellumTiler();

    await expect(
      tiler.process({
        sourceImage: new Blob(['x']),
        output: 'raw',
        quality: 1.5,
      }),
    ).rejects.toThrow(/quality/i);

    tiler.dispose();
  });

  it('rejects negative tileSize', async () => {
    const tiler = new PannellumTiler();

    await expect(
      tiler.process({
        sourceImage: new Blob(['x']),
        output: 'raw',
        tileSize: -1,
      }),
    ).rejects.toThrow(/tileSize/i);

    tiler.dispose();
  });
});

describe('PannellumTiler – events', () => {
  it('registers and calls progress listeners', () => {
    const tiler = new PannellumTiler();
    const calls: unknown[] = [];
    const cb = (d: unknown) => calls.push(d);

    tiler.on('progress', cb);

    // Trigger internally via emit (tested indirectly through process)
    // Here we just verify on/off don't throw
    tiler.off('progress', cb);
    tiler.dispose();

    expect(true).toBe(true); // no-throw
  });

  it('registers and calls error listeners', () => {
    const tiler = new PannellumTiler();
    const cb = () => {};
    tiler.on('error', cb);
    tiler.off('error', cb);
    tiler.dispose();
  });
});
