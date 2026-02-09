import { describe, it, expect } from 'vitest';
import {
  generateConfig,
  calculateCubeResolution,
  calculateMaxLevel,
} from '../src/config-generator';

describe('calculateCubeResolution', () => {
  it('computes cube resolution for a standard 4096×2048 equirect', () => {
    // 8 * floor(4096 / π / 8) = 8 * floor(163.04) = 8 * 163 = 1304
    const res = calculateCubeResolution(4096, 2048);
    expect(res).toBe(8 * Math.floor(4096 / Math.PI / 8));
    expect(res % 8).toBe(0);
  });

  it('computes cube resolution for an 8192×4096 equirect', () => {
    const res = calculateCubeResolution(8192, 4096);
    expect(res).toBe(8 * Math.floor(8192 / Math.PI / 8));
    expect(res % 8).toBe(0);
  });

  it('computes cube resolution for a 16384×8192 equirect', () => {
    const res = calculateCubeResolution(16384, 8192);
    expect(res).toBe(8 * Math.floor(16384 / Math.PI / 8));
    expect(res > 5000).toBe(true);
  });

  it('returns a multiple of 8', () => {
    for (const w of [1000, 2000, 3000, 5000, 7777, 12345]) {
      expect(calculateCubeResolution(w, w / 2) % 8).toBe(0);
    }
  });
});

describe('calculateMaxLevel', () => {
  it('returns 1 when cubeResolution equals tileSize', () => {
    expect(calculateMaxLevel(512, 512)).toBe(1);
  });

  it('returns 2 when cubeResolution is 2× tileSize', () => {
    expect(calculateMaxLevel(1024, 512)).toBe(2);
  });

  it('returns 3 for cubeResolution=2048, tileSize=512', () => {
    expect(calculateMaxLevel(2048, 512)).toBe(3);
  });

  it('returns 4 for cubeResolution=4096, tileSize=512', () => {
    expect(calculateMaxLevel(4096, 512)).toBe(4);
  });

  it('handles the edge-case correction from the Python script', () => {
    // Same logic as generate.py: if cubeSize / 2^(levels-2) == tileSize, levels -= 1
    const cube = 1024;
    const tile = 512;
    const level = calculateMaxLevel(cube, tile);
    // 1024/512 = 2 tiles → needs level 1 (1 tile) and level 2 (2×2 tiles) = 2 levels
    expect(level).toBe(2);
  });

  it('always returns at least 1', () => {
    expect(calculateMaxLevel(64, 512)).toBeGreaterThanOrEqual(1);
    expect(calculateMaxLevel(1, 1)).toBeGreaterThanOrEqual(1);
  });

  it('tileSize is clamped to cubeResolution', () => {
    // When tileSize > cubeResolution, effectiveTileSize = cubeResolution → 1 level
    expect(calculateMaxLevel(256, 512)).toBe(1);
  });
});

describe('generateConfig', () => {
  it('produces valid JSON with correct fields', () => {
    const json = generateConfig({
      tileSize: 512,
      maxLevel: 3,
      cubeResolution: 2048,
      imageFormat: 'jpeg',
      hasFallback: false,
    });

    const config = JSON.parse(json);
    expect(config.type).toBe('multires');
    expect(config.multiRes.tileResolution).toBe(512);
    expect(config.multiRes.maxLevel).toBe(3);
    expect(config.multiRes.cubeResolution).toBe(2048);
    expect(config.multiRes.extension).toBe('jpg');
    expect(config.multiRes.path).toBe('/%l/%s/%x_%y');
    expect(config.multiRes.basePath).toBe('./');
  });

  it('includes fallbackPath when hasFallback is true', () => {
    const json = generateConfig({
      tileSize: 512,
      maxLevel: 2,
      cubeResolution: 1024,
      imageFormat: 'jpeg',
      hasFallback: true,
    });

    const config = JSON.parse(json);
    expect(config.multiRes.fallbackPath).toBe('/fallback/%s');
  });

  it('omits fallbackPath when hasFallback is false', () => {
    const json = generateConfig({
      tileSize: 512,
      maxLevel: 2,
      cubeResolution: 1024,
      imageFormat: 'jpeg',
      hasFallback: false,
    });

    const config = JSON.parse(json);
    expect(config.multiRes.fallbackPath).toBeUndefined();
  });

  it('uses webp extension for webp format', () => {
    const json = generateConfig({
      tileSize: 512,
      maxLevel: 3,
      cubeResolution: 2048,
      imageFormat: 'webp',
      hasFallback: false,
    });

    const config = JSON.parse(json);
    expect(config.multiRes.extension).toBe('webp');
  });
});
