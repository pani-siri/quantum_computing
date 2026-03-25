/**
 * Lightweight face detection using skin-color analysis in HSV color space.
 * No external APIs, no model files — pure pixel math.
 *
 * Algorithm:
 * 1. Sample pixels from webcam frame
 * 2. Convert RGB → HSV
 * 3. Check if pixel falls in skin-color range
 * 4. If skin-pixel percentage > threshold → face present
 * 5. Additionally check that skin pixels form a clustered region (not scattered noise)
 */

// HSV skin color thresholds (empirically tuned for webcam lighting)
const SKIN_H_MIN = 0;
const SKIN_H_MAX = 50;
const SKIN_S_MIN = 0.15;
const SKIN_S_MAX = 0.75;
const SKIN_V_MIN = 0.20;
const SKIN_V_MAX = 1.0;

// Minimum percentage of skin pixels to consider a face present
const SKIN_THRESHOLD = 0.04; // 4% of sampled pixels
// Minimum cluster ratio — skin pixels should be concentrated, not scattered
const CLUSTER_THRESHOLD = 0.3;

function rgbToHsv(r: number, g: number, b: number): [number, number, number] {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  let h = 0;
  const s = max === 0 ? 0 : d / max;
  const v = max;

  if (d !== 0) {
    if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) * 60;
    else if (max === g) h = ((b - r) / d + 2) * 60;
    else h = ((r - g) / d + 4) * 60;
  }

  return [h, s, v];
}

function isSkinPixel(r: number, g: number, b: number): boolean {
  // Quick RGB pre-filter (skin is never very blue or very green without red)
  if (r < 40 || (b > r && b > g)) return false;
  // Uniform color check (avoid pure white/gray backgrounds)
  const rgDiff = Math.abs(r - g);
  if (rgDiff < 5 && Math.abs(r - b) < 5) return false;

  const [h, s, v] = rgbToHsv(r, g, b);
  return h >= SKIN_H_MIN && h <= SKIN_H_MAX &&
         s >= SKIN_S_MIN && s <= SKIN_S_MAX &&
         v >= SKIN_V_MIN && v <= SKIN_V_MAX;
}

export interface FaceDetectionResult {
  faceDetected: boolean;
  skinPercentage: number;
  clusterRatio: number;
}

/**
 * Detect if a face is present in the given video element.
 * Returns synchronously after analyzing a single frame.
 */
export function detectFace(
  video: HTMLVideoElement,
  canvas: HTMLCanvasElement,
  ctx: CanvasRenderingContext2D
): FaceDetectionResult {
  const w = video.videoWidth || 160;
  const h = video.videoHeight || 120;
  canvas.width = w;
  canvas.height = h;
  ctx.drawImage(video, 0, 0, w, h);

  const imageData = ctx.getImageData(0, 0, w, h);
  const data = imageData.data;

  // Sample every 4th pixel for performance (still plenty of data)
  const step = 4;
  let totalSampled = 0;
  let skinCount = 0;

  // Track skin pixel positions for cluster analysis (grid-based)
  const gridCols = 8;
  const gridRows = 6;
  const cellW = w / gridCols;
  const cellH = h / gridRows;
  const grid = new Uint16Array(gridCols * gridRows);

  for (let y = 0; y < h; y += step) {
    for (let x = 0; x < w; x += step) {
      const i = (y * w + x) * 4;
      totalSampled++;

      if (isSkinPixel(data[i], data[i + 1], data[i + 2])) {
        skinCount++;
        const gx = Math.min(Math.floor(x / cellW), gridCols - 1);
        const gy = Math.min(Math.floor(y / cellH), gridRows - 1);
        grid[gy * gridCols + gx]++;
      }
    }
  }

  const skinPercentage = totalSampled > 0 ? skinCount / totalSampled : 0;

  // Cluster analysis: count how many grid cells have significant skin pixels
  const minCellSkin = Math.max(1, totalSampled / (gridCols * gridRows) * 0.05);
  let activeCells = 0;
  let maxCellSkin = 0;
  for (let i = 0; i < grid.length; i++) {
    if (grid[i] > minCellSkin) activeCells++;
    if (grid[i] > maxCellSkin) maxCellSkin = grid[i];
  }

  // Cluster ratio: skin should be concentrated in a connected region
  // A face typically activates 4-15 cells out of 48 (8x6 grid)
  const totalCells = gridCols * gridRows;
  const clusterRatio = activeCells > 0 ? activeCells / totalCells : 0;

  // Face detected if: enough skin pixels AND they're clustered (not scattered noise)
  const faceDetected = skinPercentage >= SKIN_THRESHOLD &&
                       clusterRatio >= 0.05 &&
                       clusterRatio <= CLUSTER_THRESHOLD &&
                       activeCells >= 3;

  return { faceDetected, skinPercentage, clusterRatio };
}
