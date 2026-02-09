import type { TileMetadata } from './types';

/**
 * Generate the Pannellum `config.json` content for a multi-resolution
 * tile set.
 *
 * The generated configuration uses the path template `/%l/%s/%x_%y`
 * where:
 *   %l → zoom level
 *   %s → face letter (f, r, b, l, u, d)
 *   %x → tile column
 *   %y → tile row
 *
 * @param metadata - Tile set metadata.
 * @returns Stringified JSON suitable for writing to `config.json`.
 */
export function generateConfig(metadata: TileMetadata): string {
  const multiRes: Record<string, unknown> = {
    basePath: './',
    path: '/%l/%s/%x_%y',
    extension: metadata.imageFormat === 'webp' ? 'webp' : 'jpg',
    tileResolution: metadata.tileSize,
    maxLevel: metadata.maxLevel,
    cubeResolution: metadata.cubeResolution,
  };

  if (metadata.hasFallback) {
    multiRes.fallbackPath = '/fallback/%s';
  }

  const config = {
    type: 'multires',
    multiRes,
  };

  return JSON.stringify(config, null, 2);
}

/**
 * Calculate the optimal cube-face resolution from the source equirectangular
 * image dimensions.
 *
 * Matches the formula used by Pannellum's `generate.py`:
 * ```
 * cubeSize = 8 * int( (360 / haov) * origWidth / π / 8 )
 * ```
 * For a full 360 × 180 equirectangular image this simplifies to
 * `8 * floor(origWidth / π / 8)`.
 *
 * @param imageWidth  - Width of the equirectangular source in pixels.
 * @param _imageHeight - Height (unused for full panoramas but reserved).
 * @returns Cube face resolution in pixels (always a multiple of 8).
 */
export function calculateCubeResolution(
  imageWidth: number,
  _imageHeight: number,
): number {
  return 8 * Math.floor(imageWidth / Math.PI / 8);
}

/**
 * Calculate the number of zoom levels required for the tile pyramid.
 *
 * Matches the Python script logic:
 * ```
 * levels = ceil(log2(cubeResolution / tileSize)) + 1
 * ```
 * with an edge-case correction when the level-2 size equals the tile size.
 *
 * @param cubeResolution - Cube face resolution at the highest zoom level.
 * @param tileSize       - Individual tile width/height in pixels.
 * @returns The maximum zoom level (≥ 1).
 */
export function calculateMaxLevel(
  cubeResolution: number,
  tileSize: number,
): number {
  const effectiveTileSize = Math.min(tileSize, cubeResolution);
  let levels =
    Math.ceil(Math.log(cubeResolution / effectiveTileSize) / Math.log(2)) + 1;

  // Edge-case from generate.py: avoid an extra level when the penultimate
  // level already matches the tile size exactly.
  if (
    levels >= 2 &&
    Math.floor(cubeResolution / Math.pow(2, levels - 2)) === effectiveTileSize
  ) {
    levels -= 1;
  }

  return Math.max(1, levels);
}
