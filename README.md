# pannellum-js-tiles-generator

> Client-side JavaScript library that converts equirectangular panorama images into [Pannellum](https://pannellum.org/)-compatible multi-resolution cubic tile sets — entirely in the browser.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

## Why?

Pannellum ships with a **Python script** (`generate.py`) that requires a server, Python, Pillow, NumPy, and nona (Hugin).  This library moves the heavy lifting to the **client's GPU** via Three.js + WebGL, eliminating server-side processing entirely.

## Features

- **GPU-accelerated** equirectangular → cubemap reprojection via Three.js
- **Multi-resolution tile pyramid** matching Pannellum's `multiRes` format
- **Three output modes:** ZIP download, raw structured data, or async streaming
- **Progress events** with per-stage reporting
- **Memory-managed** — aggressive Three.js resource disposal, batch processing
- **Minimal dependencies:** Three.js + fflate (< 700 KB gzipped)
- **TypeScript** with full type definitions

## Installation

```bash
npm install pannellum-js-tiles-generator
```

Or include via CDN (ES module):

```html
<script type="module">
  import { PannellumTiler } from 'https://cdn.jsdelivr.net/npm/pannellum-js-tiles-generator/dist/pannellum-js-tiles-generator.js';
</script>
```

## Quick Start

```js
import { PannellumTiler } from 'pannellum-js-tiles-generator';

const tiler = new PannellumTiler();

const result = await tiler.process({
  sourceImage: file,          // File, Blob, or URL string
  output: 'zip',              // 'zip' | 'raw' | 'stream'
  tileSize: 512,              // tile dimensions (px)
  quality: 0.85,              // JPEG quality 0–1
  onProgress: (e) => {
    console.log(`${e.stage}: ${Math.round(e.progress * 100)}%`);
  },
});

// Download the ZIP
const url = URL.createObjectURL(result.blob);
const a = document.createElement('a');
a.href = url;
a.download = 'panorama-tiles.zip';
a.click();
URL.revokeObjectURL(url);

tiler.dispose();
```

## API Reference

### `new PannellumTiler(options?)`

| Option | Type | Default | Description |
|---|---|---|---|
| `maxTextureSize` | `number` | `16384` | Maximum WebGL texture dimension |
| `debug` | `boolean` | `false` | Enable console debug logging |

### `tiler.process(config): Promise<ProcessResult>`

| Config Field | Type | Default | Description |
|---|---|---|---|
| `sourceImage` | `string \| Blob \| File` | **required** | Equirectangular panorama source |
| `output` | `'zip' \| 'raw' \| 'stream'` | **required** | Output mode |
| `tileSize` | `number` | `512` | Tile width/height in pixels |
| `maxLevel` | `number` | auto | Override the zoom level count |
| `cubeResolution` | `number` | auto | Override cube face resolution |
| `quality` | `number` | `0.9` | JPEG / WebP quality (0–1) |
| `fallbackTiles` | `boolean` | `false` | Generate single-tile fallback per face |
| `imageFormat` | `'jpeg' \| 'webp'` | `'jpeg'` | Output tile format |
| `onProgress` | `(info: ProgressInfo) => void` | — | Progress callback |

### Output Modes

#### ZIP (`output: 'zip'`)

Returns `{ blob: Blob, metadata }`.  The Blob is a ready-to-download ZIP archive containing `config.json` and all tiles.

#### Raw (`output: 'raw'`)

Returns `{ config: { json, blob }, tiles: Tile[], metadata }`.  Use this to upload tiles individually or store them in IndexedDB.

#### Stream (`output: 'stream'`)

Returns `{ config, tiles: AsyncGenerator<StreamItem>, metadata }`.  Memory-efficient: tiles are yielded one at a time via `for await…of`.

### Events

```js
tiler.on('progress', (info) => { /* ProgressInfo */ });
tiler.on('error', (err) => { /* Error */ });
tiler.off('progress', myCallback);
```

### `tiler.dispose()`

Release all internal resources.  The instance cannot be reused after disposal.

### Utility Exports

```js
import {
  generateConfig,
  calculateCubeResolution,
  calculateMaxLevel,
} from 'pannellum-js-tiles-generator';
```

## Output Structure

The generated tile set matches Pannellum's `multiRes` convention:

```
output/
├── config.json
├── 1/               ← level 1 (lowest resolution)
│   ├── f/
│   │   └── 0_0.jpg
│   ├── r/  b/  l/  u/  d/
│   │   └── 0_0.jpg
├── 2/               ← level 2
│   ├── f/
│   │   ├── 0_0.jpg  0_1.jpg
│   │   ├── 1_0.jpg  1_1.jpg
│   └── …
└── 3/               ← level 3 (highest resolution)
    └── …
```

Face identifiers: **f**ront, **r**ight, **b**ack, **l**eft, **u**p, **d**own.
Tile naming: `{column}_{row}.jpg` (zero-indexed).
Path template in config: `/%l/%s/%x_%y`.

## Browser Compatibility

| Browser | Minimum Version |
|---|---|
| Chrome / Edge | 90+ |
| Firefox | 90+ |
| Safari | 14+ |

**Required APIs:** WebGL 1.0, Canvas, Blob/File, ES2020.
**Progressive enhancement:** OffscreenCanvas, WebGL 2.0.

## Performance Guidelines

| Source Resolution | Expected Time* | Peak Memory |
|---|---|---|
| 4K (4096 × 2048) | < 30 s | ~ 500 MB |
| 8K (8192 × 4096) | < 90 s | ~ 1 GB |
| 16K (16384 × 8192) | < 5 min | < 2 GB |

*On modern hardware with discrete GPU.

**Tips:**
- Use `output: 'stream'` for very large panoramas to avoid holding all tiles in memory.
- Reduce `cubeResolution` if you don't need maximum quality.
- Close other GPU-heavy tabs to free VRAM.

## Development

```bash
# Install dependencies
npm install

# Start dev server with hot reload
npm run dev

# Type-check
npm run lint

# Run tests
npm test

# Build library bundle
npm run build
```

## Migration from Python Script

| Python script (`generate.py`) | This library |
|---|---|
| `python generate.py input.jpg -o output/` | `tiler.process({ sourceImage: file, output: 'zip' })` |
| `-s 512` (tile size) | `tileSize: 512` |
| `-q 75` (quality 0–100) | `quality: 0.75` (0–1) |
| `-c 2048` (cube size) | `cubeResolution: 2048` |
| `-f 1024` (fallback size) | `fallbackTiles: true` |
| `--png` | `imageFormat: 'webp'` (no PNG; use WebP instead) |

**Differences:**
- This library uses `/%l/%s/%x_%y` path format (face as subdirectory) vs the Python script's `/%l/%s%y_%x` (face letter in filename). Both are valid — Pannellum reads the `path` template from `config.json`.
- No SHT hash preview (requires pyshtools).
- No equirectangular thumbnail preview.
- No partial panorama / cylindrical input support (full 360×180 equirectangular only in v1).

## License

MIT — see [LICENSE](LICENSE).

## Credits

- [Pannellum](https://pannellum.org/) by Matthew Petroff
- [Three.js](https://threejs.org/)
- [fflate](https://github.com/101arrowz/fflate)
