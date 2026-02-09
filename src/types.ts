/**
 * Configuration options for the PannellumTiler constructor.
 */
export interface TilerOptions {
  /** Maximum WebGL texture size to use. Auto-detected if not specified. */
  maxTextureSize?: number;
  /** Enable debug logging. */
  debug?: boolean;
}

/**
 * Input configuration for the `process()` method.
 */
export interface ProcessConfig {
  /** Source equirectangular panorama image (URL string, Blob, or File). */
  sourceImage: string | Blob | File;

  /** Tile size in pixels. Default: 512. */
  tileSize?: number;

  /** Override the auto-calculated maximum zoom level. */
  maxLevel?: number;

  /** Override the auto-calculated cube face resolution. */
  cubeResolution?: number;

  /** JPEG/WebP quality (0–1). Default: 0.9. */
  quality?: number;

  /** Output mode: 'zip' for downloadable archive, 'raw' for structured data, 'stream' for async iteration. */
  output: 'zip' | 'raw' | 'stream';

  /** Generate fallback tiles (single low-res tile per face). Default: false. */
  fallbackTiles?: boolean;

  /** Output image format. Default: 'jpeg'. */
  imageFormat?: 'jpeg' | 'webp';

  /** Progress callback invoked during processing. */
  onProgress?: (progress: ProgressInfo) => void;
}

/**
 * Progress information emitted during processing.
 */
export interface ProgressInfo {
  /** Current processing stage. */
  stage: 'loading' | 'reprojection' | 'tiling' | 'encoding' | 'packaging';
  /** Progress within the current stage (0–1). */
  progress: number;
  /** Current zoom level being processed. */
  currentLevel?: number;
  /** Current cube face being processed. */
  currentFace?: string;
  /** Human-readable status message. */
  message?: string;
}

/**
 * A single cube face image produced by the reprojector.
 */
export interface CubeFace {
  /** Face identifier: 'f' | 'r' | 'b' | 'l' | 'u' | 'd'. */
  name: string;
  /** Canvas containing the rendered face image. */
  canvas: HTMLCanvasElement | OffscreenCanvas;
  /** Resolution (width = height) of the face in pixels. */
  resolution: number;
}

/**
 * A single output tile.
 */
export interface Tile {
  /** Relative file path, e.g. '1/f/0_0.jpg'. */
  path: string;
  /** Zoom level. */
  level: number;
  /** Face identifier. */
  face: string;
  /** Column index (zero-based). */
  x: number;
  /** Row index (zero-based). */
  y: number;
  /** Tile image as a Blob. */
  blob: Blob;
  /** Size in bytes. */
  size: number;
}

/**
 * Metadata used for Pannellum configuration generation.
 */
export interface TileMetadata {
  tileSize: number;
  maxLevel: number;
  cubeResolution: number;
  imageFormat: 'jpeg' | 'webp';
  hasFallback: boolean;
}

/**
 * Result returned when `output` is 'zip'.
 */
export interface ZipResult {
  /** The complete ZIP archive as a Blob. */
  blob: Blob;
  /** Processing metadata. */
  metadata: ResultMetadata;
}

/**
 * Result returned when `output` is 'raw'.
 */
export interface RawResult {
  /** Pannellum config.json content. */
  config: {
    /** JSON string. */
    json: string;
    /** Blob suitable for uploading. */
    blob: Blob;
  };
  /** Array of all generated tiles. */
  tiles: Tile[];
  /** Processing metadata. */
  metadata: ResultMetadata;
}

/**
 * Result returned when `output` is 'stream'.
 */
export interface StreamResult {
  /** Pannellum config.json content. */
  config: {
    json: string;
    blob: Blob;
  };
  /** Async iterator yielding tiles one by one for memory-efficient processing. */
  tiles: AsyncGenerator<StreamItem>;
  /** Processing metadata. */
  metadata: ResultMetadata;
}

/**
 * A single item yielded by the stream output mode.
 */
export interface StreamItem {
  type: 'config' | 'tile';
  path: string;
  blob: Blob;
  level?: number;
  face?: string;
  x?: number;
  y?: number;
}

/**
 * Summary metadata about the generated tile set.
 */
export interface ResultMetadata {
  /** Total number of tiles generated. */
  totalTiles: number;
  /** Total size of all tiles in bytes. */
  totalSize: number;
  /** Highest zoom level generated. */
  maxLevel: number;
  /** Cube face resolution at max level in pixels. */
  cubeResolution: number;
  /** Individual tile size in pixels. */
  tileSize: number;
  /** Array of face identifiers. */
  faces: string[];
}

/** Union of all possible process() return types. */
export type ProcessResult = ZipResult | RawResult | StreamResult;

/**
 * Internal face configuration for cube rendering.
 */
export interface FaceConfig {
  /** Face identifier. */
  name: string;
  /** Camera look-at direction [x, y, z]. */
  target: [number, number, number];
  /** Camera up vector [x, y, z]. */
  up: [number, number, number];
}
