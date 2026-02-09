/**
 * Web Worker for off-loading tile encoding to a separate thread using
 * OffscreenCanvas.
 *
 * This worker is a **progressive enhancement**: the library falls back
 * to main-thread canvas operations when Web Workers or OffscreenCanvas
 * are unavailable.
 *
 * Messages accepted:
 *   { id, imageData, sx, sy, sw, sh, outputSize, mimeType, quality }
 *
 * Messages emitted:
 *   { id, blob }          on success
 *   { id, blob, error }   on failure
 */

interface TileRequest {
  id: number;
  imageData: ImageData;
  sx: number;
  sy: number;
  sw: number;
  sh: number;
  outputSize: number;
  mimeType: string;
  quality: number;
}

interface TileResponse {
  id: number;
  blob: Blob;
  error?: string;
}

self.onmessage = async (event: MessageEvent<TileRequest>) => {
  const { id, imageData, sx, sy, sw, sh, outputSize, mimeType, quality } =
    event.data;

  try {
    // Reconstruct source from transferred ImageData
    const srcCanvas = new OffscreenCanvas(imageData.width, imageData.height);
    const srcCtx = srcCanvas.getContext('2d')!;
    srcCtx.putImageData(imageData, 0, 0);

    // Crop & scale into output tile
    const tileCanvas = new OffscreenCanvas(outputSize, outputSize);
    const tileCtx = tileCanvas.getContext('2d')!;
    tileCtx.drawImage(srcCanvas, sx, sy, sw, sh, 0, 0, outputSize, outputSize);

    const blob = await tileCanvas.convertToBlob({
      type: mimeType,
      quality,
    });

    const response: TileResponse = { id, blob };
    self.postMessage(response);
  } catch (err) {
    const response: TileResponse = {
      id,
      blob: new Blob(),
      error: (err as Error).message,
    };
    self.postMessage(response);
  }
};
