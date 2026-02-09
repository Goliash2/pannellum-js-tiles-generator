import * as THREE from 'three';
import type { CubeFace, FaceConfig, ProgressInfo } from './types';
import { MemoryManager } from './utils/memory-manager';

/**
 * Camera direction and up-vector for each Pannellum cube face.
 *
 * Orientation matches the nona / Pannellum convention:
 *   front  → −Z   (yaw = 0)
 *   back   → +Z   (yaw = 180)
 *   left   → −X   (yaw = 90)
 *   right  → +X   (yaw = −90)
 *   up     → +Y   (pitch = −90)
 *   down   → −Y   (pitch = 90)
 */
const FACE_CONFIGS: FaceConfig[] = [
  { name: 'f', target: [0, 0, -1], up: [0, 1, 0] },
  { name: 'r', target: [1, 0, 0], up: [0, 1, 0] },
  { name: 'b', target: [0, 0, 1], up: [0, 1, 0] },
  { name: 'l', target: [-1, 0, 0], up: [0, 1, 0] },
  { name: 'u', target: [0, 1, 0], up: [0, 0, 1] },
  { name: 'd', target: [0, -1, 0], up: [0, 0, -1] },
];

/**
 * Converts an equirectangular panorama image into six cube-face canvases
 * using Three.js and WebGL.
 *
 * The approach:
 * 1. Map the equirectangular image onto the inside of a sphere.
 * 2. Place a 90° FOV perspective camera at the centre.
 * 3. Render once per face, reading the pixels back into a canvas.
 */
export class Reprojector {
  private memory = new MemoryManager();
  private maxTextureSize: number;

  constructor(maxTextureSize?: number) {
    this.maxTextureSize = maxTextureSize ?? 16384;
  }

  /**
   * Reproject an equirectangular image to six cube-face canvases.
   *
   * @param image          - Loaded HTMLImageElement containing the panorama.
   * @param cubeResolution - Width/height of each cube face in pixels.
   * @param onProgress     - Optional progress callback.
   * @returns Array of six {@link CubeFace} objects.
   */
  async reprojectToCubeFaces(
    image: HTMLImageElement,
    cubeResolution: number,
    onProgress?: (info: ProgressInfo) => void,
  ): Promise<CubeFace[]> {
    // ── Create an off-screen WebGL renderer ──────────────────────────
    const canvas = document.createElement('canvas');
    canvas.width = cubeResolution;
    canvas.height = cubeResolution;

    const renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: false,
      alpha: false,
      preserveDrawingBuffer: true,
    });
    renderer.setSize(cubeResolution, cubeResolution, false);
    this.memory.setRenderer(renderer);

    // Validate GPU limits
    const gl = renderer.getContext();
    const maxSize = gl.getParameter(gl.MAX_TEXTURE_SIZE) as number;
    const effectiveMaxTexture = Math.min(maxSize, this.maxTextureSize);
    if (cubeResolution > effectiveMaxTexture) {
      throw new Error(
        `Cube resolution ${cubeResolution} exceeds maximum texture size ${effectiveMaxTexture}`,
      );
    }

    // ── Build the equirectangular scene ──────────────────────────────
    const texture = new THREE.Texture(image);
    texture.needsUpdate = true;
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    this.memory.trackTexture(texture);

    // Inside-out sphere so the camera can see the texture from within.
    const geometry = new THREE.SphereGeometry(500, 64, 32);
    geometry.scale(-1, 1, 1);
    this.memory.trackGeometry(geometry);

    const material = new THREE.MeshBasicMaterial({ map: texture });
    this.memory.trackMaterial(material);

    const scene = new THREE.Scene();
    scene.add(new THREE.Mesh(geometry, material));

    // 90° square camera for cube-face capture
    const camera = new THREE.PerspectiveCamera(90, 1, 0.1, 1000);
    camera.position.set(0, 0, 0);

    // Render target for reading pixels back
    const renderTarget = new THREE.WebGLRenderTarget(
      cubeResolution,
      cubeResolution,
      {
        minFilter: THREE.LinearFilter,
        magFilter: THREE.LinearFilter,
        format: THREE.RGBAFormat,
        type: THREE.UnsignedByteType,
        colorSpace: THREE.SRGBColorSpace,
      },
    );
    this.memory.trackRenderTarget(renderTarget);

    // ── Render each face ─────────────────────────────────────────────
    const faces: CubeFace[] = [];

    for (let i = 0; i < FACE_CONFIGS.length; i++) {
      const cfg = FACE_CONFIGS[i];

      onProgress?.({
        stage: 'reprojection',
        progress: i / FACE_CONFIGS.length,
        currentFace: cfg.name,
        message: `Rendering cube face: ${cfg.name}`,
      });

      // Point camera at this face
      camera.up.set(cfg.up[0], cfg.up[1], cfg.up[2]);
      camera.lookAt(cfg.target[0], cfg.target[1], cfg.target[2]);
      camera.updateProjectionMatrix();

      // Render into the render target
      renderer.setRenderTarget(renderTarget);
      renderer.render(scene, camera);

      // Read pixels (WebGL returns bottom-to-top rows)
      const pixels = new Uint8Array(cubeResolution * cubeResolution * 4);
      renderer.readRenderTargetPixels(
        renderTarget,
        0,
        0,
        cubeResolution,
        cubeResolution,
        pixels,
      );

      // Write into a 2-D canvas, flipping Y so row 0 is at the top
      const faceCanvas = document.createElement('canvas');
      faceCanvas.width = cubeResolution;
      faceCanvas.height = cubeResolution;
      const ctx = faceCanvas.getContext('2d')!;
      const imageData = ctx.createImageData(cubeResolution, cubeResolution);

      for (let row = 0; row < cubeResolution; row++) {
        const srcOff = row * cubeResolution * 4;
        const dstOff = (cubeResolution - 1 - row) * cubeResolution * 4;
        imageData.data.set(
          pixels.subarray(srcOff, srcOff + cubeResolution * 4),
          dstOff,
        );
      }
      ctx.putImageData(imageData, 0, 0);

      faces.push({
        name: cfg.name,
        canvas: faceCanvas,
        resolution: cubeResolution,
      });
    }

    // Reset renderer state
    renderer.setRenderTarget(null);

    onProgress?.({
      stage: 'reprojection',
      progress: 1,
      message: 'Cube face reprojection complete',
    });

    // Free all GPU resources immediately
    this.dispose();

    return faces;
  }

  /** Release all tracked GPU / memory resources. */
  dispose(): void {
    this.memory.disposeAll();
  }
}
