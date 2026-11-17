/**
 * StoryReader - Client-side Non-AI Rotation and Orientation Detector
 * Detects device screen tilt and text line gradient variance without AI calls.
 */

/**
 * Extracts and normalizes the device rotation angle (0, 90, 180, 270)
 * from screen.orientation.angle or window.orientation.
 *
 * @param {Object|Window} [windowObj]
 * @returns {number} Normalized angle (0, 90, 180, 270)
 */
export function detectDeviceRotation(windowObj) {
  if (!windowObj) return 0;

  let angle;
  if (
    windowObj.screen &&
    windowObj.screen.orientation &&
    typeof windowObj.screen.orientation.angle === 'number'
  ) {
    angle = windowObj.screen.orientation.angle;
  } else if (typeof windowObj.orientation === 'number') {
    angle = windowObj.orientation;
  }

  if (typeof angle !== 'number' || !Number.isFinite(angle)) {
    return 0;
  }

  // Normalize negative or arbitrary degrees to [0, 360) in 90-degree steps
  const normalized = ((angle % 360) + 360) % 360;
  return normalized;
}

/**
 * Calculates horizontal vs vertical gradient and projection variance of text lines,
 * returning whether the page appears to be sideways (90° rotated) without using AI.
 *
 * Upright text has lines running horizontally (high variance/contrast across Y rows, low across X columns).
 * Sideways text has lines running vertically (high variance/contrast across X columns, low across Y rows).
 *
 * @param {Uint8Array|Array<number>} grayscaleData - Grayscale pixel intensity values (0-255)
 * @param {number} width - Image width
 * @param {number} height - Image height
 * @returns {{ recommendedRotation: 0 | 90, isSideways: boolean, ratio: number }}
 */
export function detectTextOrientationFromGrayscale(grayscaleData, width, height) {
  if (!grayscaleData || width <= 1 || height <= 1) {
    return { recommendedRotation: 0, isSideways: false, ratio: 1.0 };
  }

  // 1. Projection profiles: average row intensity and column intensity
  const rowMeans = new Float64Array(height);
  for (let y = 0; y < height; y++) {
    let sum = 0;
    const offset = y * width;
    for (let x = 0; x < width; x++) {
      sum += grayscaleData[offset + x];
    }
    rowMeans[y] = sum / width;
  }

  const colMeans = new Float64Array(width);
  for (let x = 0; x < width; x++) {
    let sum = 0;
    for (let y = 0; y < height; y++) {
      sum += grayscaleData[y * width + x];
    }
    colMeans[x] = sum / height;
  }

  // 2. Variance of projection profiles
  let meanRow = 0;
  for (let y = 0; y < height; y++) meanRow += rowMeans[y];
  meanRow /= height;
  let varRow = 0;
  for (let y = 0; y < height; y++) varRow += (rowMeans[y] - meanRow) ** 2;
  varRow /= height;

  let meanCol = 0;
  for (let x = 0; x < width; x++) meanCol += colMeans[x];
  meanCol /= width;
  let varCol = 0;
  for (let x = 0; x < width; x++) varCol += (colMeans[x] - meanCol) ** 2;
  varCol /= width;

  // 3. Pixel gradient variance: difference between adjacent pixels in X vs Y
  let gradXSum = 0;
  let gradYSum = 0;
  for (let y = 0; y < height; y++) {
    const offset = y * width;
    for (let x = 0; x < width; x++) {
      if (x < width - 1) {
        gradXSum += Math.abs(grayscaleData[offset + x + 1] - grayscaleData[offset + x]);
      }
      if (y < height - 1) {
        gradYSum += Math.abs(grayscaleData[offset + width + x] - grayscaleData[offset + x]);
      }
    }
  }

  // When text is upright (horizontal lines), row variance and vertical gradients (gradY) dominate.
  // When text is sideways (vertical lines), column variance and horizontal gradients (gradX) dominate.
  const vertMetric = varRow * 100 + gradYSum / Math.max(1, width * height);
  const horizMetric = varCol * 100 + gradXSum / Math.max(1, width * height);

  // Ratio of horizontal contrast to vertical contrast with ambient noise floor (> 1 implies text lines run vertically)
  const baseline = 30000;
  const ratio = (horizMetric + baseline) / (vertMetric + baseline);
  const isDefinitiveSideways = ratio > 1.35;
  const isModerateSideways = ratio > 1.15 && width > height; // Only landscape aspect ratios
  const isSideways = isDefinitiveSideways || isModerateSideways;

  return {
    recommendedRotation: isSideways ? 90 : 0,
    isSideways,
    ratio: Number(ratio.toFixed(3)),
  };
}

/**
 * Reads 2D canvas ImageData, converts to grayscale luminance,
 * and delegates to detectTextOrientationFromGrayscale.
 *
 * @param {HTMLCanvasElement|Object} canvas - HTML Canvas or mock canvas with getContext('2d')
 * @returns {{ recommendedRotation: 0 | 90, isSideways: boolean, ratio: number }}
 */
export function detectCanvasOrientation(canvas) {
  if (!canvas) {
    return { recommendedRotation: 0, isSideways: false, ratio: 1.0 };
  }

  let width = canvas.width;
  let height = canvas.height;
  let data;

  if (canvas.data && width && height) {
    data = canvas.data;
  } else if (typeof canvas.getContext === 'function') {
    const ctx = canvas.getContext('2d');
    if (!ctx) return { recommendedRotation: 0, isSideways: false, ratio: 1.0 };
    const imgData = ctx.getImageData(0, 0, width, height);
    data = imgData ? imgData.data : null;
  }

  if (!data || width <= 1 || height <= 1) {
    return { recommendedRotation: 0, isSideways: false, ratio: 1.0 };
  }

  const grayscale = new Uint8Array(width * height);
  for (let i = 0, j = 0; i < data.length; i += 4, j++) {
    // Standard luminance formula: 0.299 R + 0.587 G + 0.114 B
    grayscale[j] = (data[i] * 77 + data[i + 1] * 150 + data[i + 2] * 29) >> 8;
  }

  return detectTextOrientationFromGrayscale(grayscale, width, height);
}

if (typeof window !== 'undefined') {
  window.detectDeviceRotation = detectDeviceRotation;
  window.detectTextOrientationFromGrayscale = detectTextOrientationFromGrayscale;
  window.detectCanvasOrientation = detectCanvasOrientation;
}

export default {
  detectDeviceRotation,
  detectTextOrientationFromGrayscale,
  detectCanvasOrientation,
};
