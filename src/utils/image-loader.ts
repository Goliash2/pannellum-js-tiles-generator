/**
 * Load an image from various input sources (URL, Blob, or File).
 *
 * When loading from a URL with `onProgress`, an XHR request is used to
 * enable download progress tracking. Otherwise a simple `<img>` element is
 * used.
 *
 * @param source - URL string, Blob, or File to load.
 * @param onProgress - Optional callback receiving download progress (0–1).
 * @returns Loaded HTMLImageElement ready for use as a texture source.
 */
export async function loadImage(
  source: string | Blob | File,
  onProgress?: (progress: number) => void,
): Promise<HTMLImageElement> {
  if (typeof source === 'string') {
    return loadImageFromUrl(source, onProgress);
  }
  return loadImageFromBlob(source);
}

/**
 * Load an image from a URL.  When an `onProgress` callback is supplied the
 * image is fetched via XMLHttpRequest so that we can report download progress.
 */
function loadImageFromUrl(
  url: string,
  onProgress?: (progress: number) => void,
): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    if (onProgress) {
      const xhr = new XMLHttpRequest();
      xhr.open('GET', url, true);
      xhr.responseType = 'blob';
      xhr.onprogress = (e) => {
        if (e.lengthComputable) {
          onProgress(e.loaded / e.total);
        }
      };
      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          loadImageFromBlob(xhr.response as Blob)
            .then(resolve)
            .catch(reject);
        } else {
          reject(new Error(`Failed to load image: HTTP ${xhr.status}`));
        }
      };
      xhr.onerror = () => reject(new Error('Network error loading image'));
      xhr.send();
    } else {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => resolve(img);
      img.onerror = () =>
        reject(new Error(`Failed to load image from URL: ${url}`));
      img.src = url;
    }
  });
}

/**
 * Load an image from a Blob or File by creating an object URL.
 */
function loadImageFromBlob(blob: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Failed to load image from Blob'));
    };
    img.src = url;
  });
}
