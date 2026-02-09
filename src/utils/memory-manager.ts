import type {
  Texture,
  BufferGeometry,
  Material,
  WebGLRenderTarget,
  WebGLRenderer,
} from 'three';

/**
 * Tracks Three.js GPU resources and ensures they are properly disposed to
 * prevent WebGL memory leaks.
 *
 * Usage:
 * ```ts
 * const mm = new MemoryManager();
 * const tex = mm.trackTexture(new THREE.Texture(...));
 * // ... use tex ...
 * mm.disposeAll(); // releases everything
 * ```
 */
export class MemoryManager {
  private textures: Set<Texture> = new Set();
  private geometries: Set<BufferGeometry> = new Set();
  private materials: Set<Material> = new Set();
  private renderTargets: Set<WebGLRenderTarget> = new Set();
  private renderer: WebGLRenderer | null = null;

  /** Track a texture for later disposal. */
  trackTexture<T extends Texture>(texture: T): T {
    this.textures.add(texture);
    return texture;
  }

  /** Track a geometry for later disposal. */
  trackGeometry<T extends BufferGeometry>(geometry: T): T {
    this.geometries.add(geometry);
    return geometry;
  }

  /** Track a material for later disposal. */
  trackMaterial<T extends Material>(material: T): T {
    this.materials.add(material);
    return material;
  }

  /** Track a render target for later disposal. */
  trackRenderTarget<T extends WebGLRenderTarget>(target: T): T {
    this.renderTargets.add(target);
    return target;
  }

  /** Register the renderer so it can be disposed along with everything else. */
  setRenderer(renderer: WebGLRenderer): void {
    this.renderer = renderer;
  }

  /**
   * Dispose **all** tracked resources and force-lose the WebGL context.
   */
  disposeAll(): void {
    for (const texture of this.textures) texture.dispose();
    this.textures.clear();

    for (const geometry of this.geometries) geometry.dispose();
    this.geometries.clear();

    for (const material of this.materials) material.dispose();
    this.materials.clear();

    for (const target of this.renderTargets) target.dispose();
    this.renderTargets.clear();

    if (this.renderer) {
      this.renderer.dispose();
      this.renderer.forceContextLoss();
      const canvas = this.renderer.domElement;
      canvas.width = 1;
      canvas.height = 1;
      this.renderer = null;
    }
  }

  /**
   * Yield to the event loop so the garbage collector has a chance to run.
   * Useful between heavy processing batches.
   */
  static yieldToGC(): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, 0));
  }
}
