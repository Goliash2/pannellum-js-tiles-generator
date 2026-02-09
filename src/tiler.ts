import type { CubeFace, Tile, ProgressInfo } from './types';
import { MemoryManager } from './utils/memory-manager';

/** Max tiles to encode in parallel before yielding. */
const TILE_BATCH_SIZE = 10;

/**
 * Slices cube-face canvases into a multi-resolution tile pyramid
 * compatible with Pannellum's `multiRes` viewer.
 *
 * For each face the tiler:
 * 1. Divides the max-resolution canvas into `tileSize × tileSize` tiles.
 * 2. Down-samples the face by 2× and repeats for the next zoom level.
 * 3. Continues until the entire face fits in a single tile (level 1).
 */
export class Tiler {
  private quality: number;
  private imageFormat: 'jpeg' | 'webp';

  /**
   * @param quality     JPEG / WebP quality (0–1). Default 0.9.
   * @param imageFormat Output image format. Default 'jpeg'.
   */
  constructor(quality = 0.9, imageFormat: 'jpeg' | 'webp' = 'jpeg') {
    this.quality = quality;
    this.imageFormat = imageFormat;
  }

  /**
   * Generate tiles for **all** faces at **all** zoom levels.
   */
  async generateTilePyramid(
    cubeFaces: CubeFace[],
    tileSize: number,
    maxLevel: number,
    onProgress?: (info: ProgressInfo) => void,
  ): Promise<Tile[]> {
    const tiles: Tile[] = [];
    const totalFaces = cubeFaces.length;
    let faceIndex = 0;

    for (const face of cubeFaces) {
      const faceTiles = await this.generateFaceTiles(
        face,
        tileSize,
        maxLevel,
        (levelProgress, level) => {
          const overall = (faceIndex + levelProgress) / totalFaces;
          onProgress?.({
            stage: 'tiling',
            progress: overall,
            currentLevel: level,
            currentFace: face.name,
            message: `Tiling face ${face.name}, level ${level}`,
          });
        },
      );
      tiles.push(...faceTiles);
      faceIndex++;
    }

    onProgress?.({
      stage: 'tiling',
      progress: 1,
      message: 'Tile generation complete',
    });

    return tiles;
  }

  /**
   * Generate low-resolution fallback tiles (one per face).
   * These are placed in `fallback/{face}.{ext}`.
   */
  async generateFallbackTiles(
    cubeFaces: CubeFace[],
    fallbackSize: number,
  ): Promise<Tile[]> {
    const tiles: Tile[] = [];
    const ext = this.imageFormat === 'webp' ? 'webp' : 'jpg';

    for (const face of cubeFaces) {
      const blob = await this.extractTile(
        face.canvas,
        0,
        0,
        face.resolution,
        face.resolution,
        fallbackSize,
      );

      tiles.push({
        path: `fallback/${face.name}.${ext}`,
        level: 0,
        face: face.name,
        x: 0,
        y: 0,
        blob,
        size: blob.size,
      });
    }

    return tiles;
  }

  // ── Private helpers ────────────────────────────────────────────────

  /**
   * Generate tiles for a single face across all zoom levels (max → 1).
   */
  private async generateFaceTiles(
    face: CubeFace,
    tileSize: number,
    maxLevel: number,
    onProgress?: (levelProgress: number, level: number) => void,
  ): Promise<Tile[]> {
    const tiles: Tile[] = [];
    const totalLevels = maxLevel;

    let currentCanvas: HTMLCanvasElement | OffscreenCanvas = face.canvas;
    let currentResolution = face.resolution;

    for (let level = maxLevel; level >= 1; level--) {
      // Down-scale for every level below max
      if (level < maxLevel) {
        currentResolution = Math.floor(currentResolution / 2);
        currentCanvas = this.downscaleCanvas(currentCanvas, currentResolution);
      }

      const tilesPerSide = Math.ceil(currentResolution / tileSize);
      const tileCoords: Array<{ x: number; y: number }> = [];

      for (let y = 0; y < tilesPerSide; y++) {
        for (let x = 0; x < tilesPerSide; x++) {
          tileCoords.push({ x, y });
        }
      }

      // Encode tiles in batches to avoid memory spikes
      for (let i = 0; i < tileCoords.length; i += TILE_BATCH_SIZE) {
        const batch = tileCoords.slice(i, i + TILE_BATCH_SIZE);
        const batchResults = await Promise.all(
          batch.map(({ x, y }) => this.buildTile(
            currentCanvas,
            currentResolution,
            tileSize,
            level,
            face.name,
            x,
            y,
          )),
        );

        tiles.push(...batchResults);

        const completedInLevel = Math.min(i + TILE_BATCH_SIZE, tileCoords.length);
        const levelProgress =
          (maxLevel - level + completedInLevel / tileCoords.length) / totalLevels;
        onProgress?.(levelProgress, level);
      }

      // Yield to GC between levels
      await MemoryManager.yieldToGC();
    }

    return tiles;
  }

  /**
   * Extract one tile from the current-level canvas and encode it.
   */
  private async buildTile(
    source: HTMLCanvasElement | OffscreenCanvas,
    sourceResolution: number,
    tileSize: number,
    level: number,
    faceName: string,
    x: number,
    y: number,
  ): Promise<Tile> {
    const sx = x * tileSize;
    const sy = y * tileSize;
    const sw = Math.min(tileSize, sourceResolution - sx);
    const sh = Math.min(tileSize, sourceResolution - sy);

    const blob = await this.extractTile(source, sx, sy, sw, sh, tileSize);
    const ext = this.imageFormat === 'webp' ? 'webp' : 'jpg';

    return {
      path: `${level}/${faceName}/${x}_${y}.${ext}`,
      level,
      face: faceName,
      x,
      y,
      blob,
      size: blob.size,
    };
  }

  /**
   * Crop a region from `source` and encode it as a JPEG / WebP blob.
   *
   * Uses `OffscreenCanvas` when available (better performance), falling
   * back to a regular `<canvas>` element.
   */
  private async extractTile(
    source: HTMLCanvasElement | OffscreenCanvas,
    sx: number,
    sy: number,
    sw: number,
    sh: number,
    outputSize: number,
  ): Promise<Blob> {
    const mimeType = this.imageFormat === 'webp' ? 'image/webp' : 'image/jpeg';

    if (typeof OffscreenCanvas !== 'undefined') {
      const oc = new OffscreenCanvas(outputSize, outputSize);
      const ctx = oc.getContext('2d')!;
      ctx.drawImage(
        source as CanvasImageSource,
        sx, sy, sw, sh,
        0, 0, outputSize, outputSize,
      );
      return oc.convertToBlob({ type: mimeType, quality: this.quality });
    }

    // Fallback: regular canvas
    const cvs = document.createElement('canvas');
    cvs.width = outputSize;
    cvs.height = outputSize;
    const ctx = cvs.getContext('2d')!;
    ctx.drawImage(
      source as CanvasImageSource,
      sx, sy, sw, sh,
      0, 0, outputSize, outputSize,
    );

    return new Promise<Blob>((resolve, reject) => {
      cvs.toBlob(
        (blob) => {
          if (blob) resolve(blob);
          else reject(new Error('Failed to encode tile'));
        },
        mimeType,
        this.quality,
      );
    });
  }

  /**
   * Down-scale a canvas to `newSize × newSize` using high-quality
   * bi-cubic-like interpolation (`imageSmoothingQuality: 'high'`).
   */
  private downscaleCanvas(
    source: HTMLCanvasElement | OffscreenCanvas,
    newSize: number,
  ): HTMLCanvasElement {
    const srcW = 'width' in source ? source.width : 0;
    const srcH = 'height' in source ? source.height : 0;

    const cvs = document.createElement('canvas');
    cvs.width = newSize;
    cvs.height = newSize;
    const ctx = cvs.getContext('2d')!;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(
      source as CanvasImageSource,
      0, 0, srcW, srcH,
      0, 0, newSize, newSize,
    );
    return cvs;
  }
}
