import { zip } from 'fflate';
import type { Tile } from '../types';

/**
 * Package tiles and configuration into a ZIP archive.
 *
 * JPEG/WebP images are already compressed, so the ZIP is created with
 * `level: 0` (store only) to avoid wasting CPU on re-compression.
 *
 * @param tiles     - Array of generated tiles.
 * @param configJson - Stringified Pannellum config.json.
 * @param onProgress - Optional callback receiving packaging progress (0–1).
 * @returns Blob containing the complete ZIP archive.
 */
export async function createZipOutput(
  tiles: Tile[],
  configJson: string,
  onProgress?: (progress: number) => void,
): Promise<Blob> {
  const files: Record<string, Uint8Array> = {};

  // Add config.json
  files['config.json'] = new TextEncoder().encode(configJson);

  // Convert each tile Blob → Uint8Array and add to the ZIP map
  const total = tiles.length;
  for (let i = 0; i < total; i++) {
    const tile = tiles[i];
    const buffer = await tile.blob.arrayBuffer();
    files[tile.path] = new Uint8Array(buffer);
    onProgress?.((i + 1) / total);
  }

  return new Promise<Blob>((resolve, reject) => {
    zip(files, { level: 0 }, (err, data) => {
      if (err) {
        reject(new Error(`ZIP creation failed: ${err.message}`));
      } else {
        resolve(new Blob([data.buffer as ArrayBuffer], { type: 'application/zip' }));
      }
    });
  });
}
