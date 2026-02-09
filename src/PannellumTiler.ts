import type {
  TilerOptions,
  ProcessConfig,
  ProcessResult,
  ProgressInfo,
  ZipResult,
  RawResult,
  StreamResult,
  StreamItem,
  Tile,
  ResultMetadata,
} from './types';
import { Reprojector } from './reprojector';
import { Tiler } from './tiler';
import {
  generateConfig,
  calculateCubeResolution,
  calculateMaxLevel,
} from './config-generator';
import { loadImage } from './utils/image-loader';
import { createZipOutput } from './utils/zip-builder';

type EventType = 'progress' | 'error';
type ProgressCallback = (data: ProgressInfo) => void;
type ErrorCallback = (err: Error) => void;
type EventCallback = ProgressCallback | ErrorCallback;

/** Canonical Pannellum face identifiers in render order. */
const FACE_NAMES = ['f', 'r', 'b', 'l', 'u', 'd'];

/**
 * Main entry-point for converting equirectangular panorama images into
 * Pannellum-compatible multi-resolution tile sets, entirely client-side.
 *
 * @example
 * ```js
 * import { PannellumTiler } from 'pannellum-js-tiles-generator';
 *
 * const tiler = new PannellumTiler();
 * const result = await tiler.process({
 *   sourceImage: myFile,
 *   output: 'zip',
 *   onProgress: (e) => console.log(`${e.stage}: ${Math.round(e.progress * 100)}%`),
 * });
 * ```
 */
export class PannellumTiler {
  private options: Required<TilerOptions>;
  private listeners = new Map<EventType, Set<EventCallback>>();
  private disposed = false;

  constructor(options?: TilerOptions) {
    this.options = {
      maxTextureSize: options?.maxTextureSize ?? 16384,
      debug: options?.debug ?? false,
    };
  }

  // ─── Public API ──────────────────────────────────────────────────

  /**
   * Process an equirectangular panorama and produce Pannellum tiles.
   *
   * @param config - Processing parameters (source image, output mode, etc.).
   * @returns A result object whose shape depends on the `output` mode.
   */
  async process(config: ProcessConfig): Promise<ProcessResult> {
    if (this.disposed) {
      throw new Error('PannellumTiler instance has been disposed');
    }

    this.validateConfig(config);

    const {
      sourceImage,
      tileSize = 512,
      quality = 0.9,
      output,
      fallbackTiles = false,
      imageFormat = 'jpeg',
      onProgress,
    } = config;

    /** Unified progress broadcaster. */
    const progress = (info: ProgressInfo): void => {
      onProgress?.(info);
      this.emit('progress', info);
    };

    try {
      // ── Stage 1: Load source image ────────────────────────────────
      progress({
        stage: 'loading',
        progress: 0,
        message: 'Loading source image…',
      });

      const image = await loadImage(sourceImage, (p) => {
        progress({
          stage: 'loading',
          progress: p,
          message: 'Loading source image…',
        });
      });

      progress({ stage: 'loading', progress: 1, message: 'Image loaded' });

      if (this.options.debug) {
        console.log(
          `[PannellumTiler] Image loaded: ${image.naturalWidth}×${image.naturalHeight}`,
        );
      }

      // ── Calculate dimensions ──────────────────────────────────────
      const cubeResolution =
        config.cubeResolution ??
        calculateCubeResolution(image.naturalWidth, image.naturalHeight);

      const maxLevel =
        config.maxLevel ?? calculateMaxLevel(cubeResolution, tileSize);

      if (this.options.debug) {
        console.log(
          `[PannellumTiler] cubeResolution=${cubeResolution}  maxLevel=${maxLevel}`,
        );
      }

      // ── Stage 2: Equirectangular → 6 cube faces (WebGL) ──────────
      const reprojector = new Reprojector(this.options.maxTextureSize);
      const cubeFaces = await reprojector.reprojectToCubeFaces(
        image,
        cubeResolution,
        progress,
      );

      // ── Stage 3: Tile generation (Canvas) ─────────────────────────
      const tiler = new Tiler(quality, imageFormat);
      const tiles = await tiler.generateTilePyramid(
        cubeFaces,
        tileSize,
        maxLevel,
        progress,
      );

      // Optional fallback tiles
      let fallbackTilesList: Tile[] = [];
      if (fallbackTiles) {
        fallbackTilesList = await tiler.generateFallbackTiles(cubeFaces, 1024);
      }

      const allTiles = [...tiles, ...fallbackTilesList];

      // ── Generate config.json ──────────────────────────────────────
      const configJson = generateConfig({
        tileSize,
        maxLevel,
        cubeResolution,
        imageFormat,
        hasFallback: fallbackTiles,
      });

      const metadata: ResultMetadata = {
        totalTiles: allTiles.length,
        totalSize: allTiles.reduce((sum, t) => sum + t.size, 0),
        maxLevel,
        cubeResolution,
        tileSize,
        faces: FACE_NAMES,
      };

      // ── Stage 4: Package output ───────────────────────────────────
      switch (output) {
        case 'zip':
          return await this.buildZipResult(
            allTiles,
            configJson,
            metadata,
            progress,
          );
        case 'raw':
          return this.buildRawResult(allTiles, configJson, metadata);
        case 'stream':
          return this.buildStreamResult(allTiles, configJson, metadata);
        default:
          throw new Error(`Unknown output mode: ${output}`);
      }
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      this.emit('error', error);
      throw error;
    }
  }

  /**
   * Register an event listener.
   *
   * @param event    - `'progress'` or `'error'`.
   * @param callback - Callback invoked when the event fires.
   */
  on(event: 'progress', callback: ProgressCallback): void;
  on(event: 'error', callback: ErrorCallback): void;
  on(event: EventType, callback: EventCallback): void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(callback);
  }

  /**
   * Remove a previously registered event listener.
   */
  off(event: EventType, callback: EventCallback): void {
    this.listeners.get(event)?.delete(callback);
  }

  /**
   * Release resources. The instance cannot be reused after this call.
   */
  dispose(): void {
    this.disposed = true;
    this.listeners.clear();
  }

  // ─── Private helpers ─────────────────────────────────────────────

  private validateConfig(config: ProcessConfig): void {
    if (!config.sourceImage) {
      throw new Error('sourceImage is required');
    }
    if (!config.output) {
      throw new Error("output mode is required ('zip' | 'raw' | 'stream')");
    }
    if (!['zip', 'raw', 'stream'].includes(config.output)) {
      throw new Error(`Invalid output mode: ${config.output}`);
    }
    if (
      config.quality !== undefined &&
      (config.quality < 0 || config.quality > 1)
    ) {
      throw new Error('quality must be between 0 and 1');
    }
    if (config.tileSize !== undefined && config.tileSize < 1) {
      throw new Error('tileSize must be a positive integer');
    }
  }

  // ── Output builders ──────────────────────────────────────────────

  private async buildZipResult(
    tiles: Tile[],
    configJson: string,
    metadata: ResultMetadata,
    progress: (info: ProgressInfo) => void,
  ): Promise<ZipResult> {
    progress({
      stage: 'packaging',
      progress: 0,
      message: 'Creating ZIP archive…',
    });

    const blob = await createZipOutput(tiles, configJson, (p) => {
      progress({
        stage: 'packaging',
        progress: p,
        message: 'Creating ZIP archive…',
      });
    });

    progress({
      stage: 'packaging',
      progress: 1,
      message: 'ZIP archive complete',
    });

    return { blob, metadata };
  }

  private buildRawResult(
    tiles: Tile[],
    configJson: string,
    metadata: ResultMetadata,
  ): RawResult {
    return {
      config: {
        json: configJson,
        blob: new Blob([configJson], { type: 'application/json' }),
      },
      tiles,
      metadata,
    };
  }

  private buildStreamResult(
    tiles: Tile[],
    configJson: string,
    metadata: ResultMetadata,
  ): StreamResult {
    return {
      config: {
        json: configJson,
        blob: new Blob([configJson], { type: 'application/json' }),
      },
      tiles: this.createTileStream(tiles, configJson),
      metadata,
    };
  }

  private async *createTileStream(
    tiles: Tile[],
    configJson: string,
  ): AsyncGenerator<StreamItem> {
    // Yield the configuration first
    yield {
      type: 'config' as const,
      path: 'config.json',
      blob: new Blob([configJson], { type: 'application/json' }),
    };

    // Then yield each tile individually
    for (const tile of tiles) {
      yield {
        type: 'tile' as const,
        path: tile.path,
        blob: tile.blob,
        level: tile.level,
        face: tile.face,
        x: tile.x,
        y: tile.y,
      };
    }
  }

  // ── Event emitter ────────────────────────────────────────────────

  private emit(event: 'progress', data: ProgressInfo): void;
  private emit(event: 'error', data: Error): void;
  private emit(event: EventType, data: ProgressInfo | Error): void {
    const callbacks = this.listeners.get(event);
    if (!callbacks) return;
    for (const cb of callbacks) {
      try {
        (cb as (d: ProgressInfo | Error) => void)(data);
      } catch {
        // Never let a listener error break the pipeline
      }
    }
  }
}
