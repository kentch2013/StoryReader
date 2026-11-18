/**
 * StoryReader - Mobile Camera Tray & Canvas Compression Engine (Module 4)
 * Client-side camera capture, canvas downsampling, sequence management, and upload harness.
 */

import { detectDeviceRotation, detectCanvasOrientation } from './orientation_detector.js';

let pageIdCounter = 0;

/**
 * Calculates downscaled dimensions preserving aspect ratio such that max(width, height) <= maxDimension.
 *
 * @param {number} width - Original image width
 * @param {number} height - Original image height
 * @param {number} [maxDimension=1600] - Ceiling dimension for width/height
 * @returns {{ width: number, height: number, scale: number }}
 */
export function calculateDownscaleDimensions(width, height, maxDimension = 1600) {
  if (
    typeof width !== 'number' ||
    typeof height !== 'number' ||
    isNaN(width) ||
    isNaN(height) ||
    width <= 0 ||
    height <= 0
  ) {
    throw new Error('Invalid dimensions: width and height must be positive numbers');
  }

  if (
    typeof maxDimension !== 'number' ||
    isNaN(maxDimension) ||
    maxDimension <= 0
  ) {
    throw new Error('Invalid dimensions: maxDimension must be a positive number');
  }

  if (width <= maxDimension && height <= maxDimension) {
    return {
      width: Math.round(width),
      height: Math.round(height),
      scale: 1,
    };
  }

  const maxSide = Math.max(width, height);
  const scale = maxDimension / maxSide;

  return {
    width: Math.round(width * scale),
    height: Math.round(height * scale),
    scale,
  };
}

/**
 * Creates a normalized page record.
 *
 * @param {Object} options
 * @param {Blob} options.blob - Image blob
 * @param {number} [options.width=0] - Page width
 * @param {number} [options.height=0] - Page height
 * @param {string} [options.originalName=''] - Original filename
 * @param {number} [options.pageNumber=1] - Contiguous 1-based page number
 * @param {string} [options.id=null] - Page unique identifier
 * @param {string} [options.previewUrl=null] - Object URL or data URL preview
 * @param {Object} [options.metrics=null] - Performance and size metrics
 * @returns {Object}
 */
export function createPageRecord({
  blob,
  width = 0,
  height = 0,
  originalName = '',
  pageNumber = 1,
  id = null,
  previewUrl = null,
  metrics = null,
  rotation = 0,
  sequenceNumber = 1,
} = {}) {
  const pageId = id || `page_${Date.now()}_${++pageIdCounter}_${Math.random().toString(36).slice(2, 8)}`;
  return {
    id: pageId,
    blob,
    width,
    height,
    originalName,
    pageNumber,
    previewUrl,
    metrics,
    rotation,
    sequenceNumber,
  };
}

/**
 * CameraTrayState manages the ordered sequence of captured book pages,
 * enforcing maximum page limits and contiguous 1-based indexing.
 */
export class CameraTrayState {
  /**
   * @param {Object} [options]
   * @param {number} [options.maxPages=20] - Maximum allowed pages ceiling per sequence
   * @param {boolean} [options.autoSequence=false] - Auto rollover to new sequence on overflow
   */
  constructor(options = {}) {
    this.maxPages = options.maxPages ?? 20;
    this.autoSequence = options.autoSequence ?? false;
    this.sequences = [[]];
    this.currentSequenceIndex = 0;
    this.pages = this.sequences[this.currentSequenceIndex];
  }

  /**
   * Starts a new sequence, archiving the current one and switching active pointer.
   * @returns {number} New sequence index
   */
  startNewSequence() {
    this.sequences.push([]);
    this.currentSequenceIndex = this.sequences.length - 1;
    this.pages = this.sequences[this.currentSequenceIndex];
    return this.currentSequenceIndex;
  }

  /**
   * Returns total number of sequences.
   * @returns {number}
   */
  getSequenceCount() {
    return this.sequences.length;
  }

  /**
   * Returns sum of pages across all sequences.
   * @returns {number}
   */
  getTotalPageCount() {
    return this.sequences.reduce((sum, seq) => sum + seq.length, 0);
  }

  /**
   * Switches active sequence pointer to target index.
   * @param {number} index
   * @returns {number} Current sequence index
   */
  switchSequence(index) {
    if (index < 0 || index >= this.sequences.length) {
      throw new RangeError(`Invalid sequence index: ${index} (total sequences: ${this.sequences.length})`);
    }
    this.currentSequenceIndex = index;
    this.pages = this.sequences[index];
    return this.currentSequenceIndex;
  }

  /**
   * Returns true if active sequence has 0 pages.
   * @returns {boolean}
   */
  isEmpty() {
    return this.pages.length === 0;
  }

  /**
   * Returns true if active sequence has reached maxPages ceiling.
   * @returns {boolean}
   */
  isFull() {
    return this.pages.length >= this.maxPages;
  }

  /**
   * Adds a page to the active sequence. Auto-rolls over to next sequence if full and autoSequence is enabled.
   *
   * @param {Object} pageData
   * @param {Blob} pageData.blob - Image blob
   * @param {number} [pageData.width]
   * @param {number} [pageData.height]
   * @param {string} [pageData.originalName]
   * @param {string} [pageData.previewUrl]
   * @param {Object} [pageData.metrics]
   * @returns {Object} Added page record
   */
  addPage(pageData) {
    if (this.isFull()) {
      if (this.autoSequence) {
        this.startNewSequence();
      } else {
        throw new Error(`Maximum page limit of ${this.maxPages} exceeded`);
      }
    }

    if (!pageData || !pageData.blob) {
      throw new Error('Page blob is required');
    }

    const pageNumber = this.pages.length + 1;
    const record = createPageRecord({
      ...pageData,
      pageNumber,
      sequenceNumber: this.currentSequenceIndex + 1,
    });
    record.sequenceNumber = this.currentSequenceIndex + 1;

    this.pages.push(record);
    return record;
  }

  /**
   * Removes a page by its unique ID and re-indexes remaining pages in active sequence.
   *
   * @param {string} pageId - ID of page to delete
   * @returns {boolean} True if page was found and removed, false otherwise
   */
  removePage(pageId) {
    const index = this.pages.findIndex((p) => p.id === pageId);
    if (index === -1) {
      return false;
    }

    const [removed] = this.pages.splice(index, 1);
    if (removed && removed.previewUrl && typeof URL !== 'undefined' && URL.revokeObjectURL) {
      try {
        URL.revokeObjectURL(removed.previewUrl);
      } catch (_) {}
    }

    this._reindex();
    return true;
  }

  /**
   * Moves a page from fromIndex to toIndex in active sequence and re-indexes remaining pages.
   *
   * @param {number} fromIndex
   * @param {number} toIndex
   */
  reorderPages(fromIndex, toIndex) {
    if (
      fromIndex < 0 ||
      fromIndex >= this.pages.length ||
      toIndex < 0 ||
      toIndex >= this.pages.length
    ) {
      throw new RangeError(
        `Invalid page indices for reordering: from ${fromIndex} to ${toIndex} (total pages: ${this.pages.length})`
      );
    }

    if (fromIndex === toIndex) {
      return;
    }

    const [moved] = this.pages.splice(fromIndex, 1);
    this.pages.splice(toIndex, 0, moved);
    this._reindex();
  }

  /**
   * Removes and returns the most recently captured page from active sequence, revoking its previewUrl.
   * If active sequence is empty, returns null.
   *
   * @returns {Object|null} The removed page record, or null if empty
   */
  retakeLastPage() {
    if (this.isEmpty()) {
      return null;
    }

    const removed = this.pages.pop();
    if (removed && removed.previewUrl && typeof URL !== 'undefined' && URL.revokeObjectURL) {
      try {
        URL.revokeObjectURL(removed.previewUrl);
      } catch (_) {}
    }

    this._reindex();
    return removed;
  }

  /**
   * Rotates a page in active sequence by specified degrees (e.g. 90, 180, 270), updating rotation state
   * and swapping width/height when necessary.
   *
   * @param {string} pageId - Unique page ID
   * @param {number} [degrees=90] - Degrees to rotate clockwise
   * @param {Blob} [newBlob=null] - Optional updated image blob
   * @returns {Object|null} Updated page record or null if not found
   */
  rotatePage(pageId, degrees = 90, newBlob = null) {
    const page = this.pages.find((p) => p.id === pageId);
    if (!page) {
      return null;
    }

    const normDeg = ((degrees % 360) + 360) % 360;
    page.rotation = (((page.rotation || 0) + degrees) % 360 + 360) % 360;

    if (normDeg === 90 || normDeg === 270) {
      const temp = page.width;
      page.width = page.height;
      page.height = temp;
    }

    if (newBlob) {
      page.blob = newBlob;
    }

    return page;
  }

  /**
   * Clears all sequences and releases object URLs.
   */
  clear() {
    if (typeof URL !== 'undefined' && URL.revokeObjectURL) {
      for (const seq of this.sequences) {
        for (const page of seq) {
          if (page.previewUrl) {
            try {
              URL.revokeObjectURL(page.previewUrl);
            } catch (_) {}
          }
        }
      }
    }
    this.sequences = [[]];
    this.currentSequenceIndex = 0;
    this.pages = this.sequences[0];
  }

  /**
   * Re-indexes active sequence pages to guarantee contiguous 1-based page numbers.
   * @private
   */
  _reindex() {
    this.pages.forEach((page, index) => {
      page.pageNumber = index + 1;
    });
  }

  /**
   * Builds multipart/form-data payload for server submission.
   * Defaults to active sequence or specific target sequence index.
   *
   * @param {string} [fieldName='images'] - Multipart form field name
   * @param {number|null} [sequenceIndex=null] - Specific sequence index or null for active sequence
   * @returns {FormData}
   */
  createFormData(fieldName = 'images', sequenceIndex = null) {
    const targetPages = (sequenceIndex !== null && sequenceIndex !== undefined)
      ? this.sequences[sequenceIndex]
      : this.pages;

    if (!targetPages || targetPages.length === 0) {
      throw new Error('Cannot create FormData from empty tray');
    }

    const formData = new FormData();
    targetPages.forEach((page) => {
      const filename = `page_${page.pageNumber}.jpg`;
      formData.append(fieldName, page.blob, filename);
    });

    return formData;
  }
}

/**
 * Calculates a 3:4 portrait auto-crop rectangle for live video snapshots,
 * aligning with the viewfinder framing guide and trimming off-screen sensor margins.
 *
 * @param {HTMLVideoElement|Object} source
 * @param {Object} [options={}]
 * @param {number} [options.targetAspect=0.75]
 * @param {number} [options.guideInsetRatio=0.04]
 * @returns {{ x: number, y: number, width: number, height: number, autoCropped: boolean }}
 */
export function calculateAutoCropRect(source, options = {}) {
  const srcWidth = source.videoWidth || source.naturalWidth || source.width || 0;
  const srcHeight = source.videoHeight || source.naturalHeight || source.height || 0;

  if (!srcWidth || !srcHeight) {
    return { x: 0, y: 0, width: srcWidth, height: srcHeight, autoCropped: false };
  }

  const {
    targetAspect = 0.75, // 3:4 portrait
    guideInsetRatio = 0.04,
  } = options;

  let visibleWidth = srcWidth;
  let visibleHeight = srcHeight;
  let offsetX = 0;
  let offsetY = 0;

  const currentAspect = srcWidth / srcHeight;

  if (currentAspect > targetAspect) {
    // Source is wider than 3:4 (e.g. 16:9 stream)
    visibleWidth = Math.round(srcHeight * targetAspect);
    offsetX = Math.round((srcWidth - visibleWidth) / 2);
  } else if (currentAspect < targetAspect) {
    // Source is taller than 3:4
    visibleHeight = Math.round(srcWidth / targetAspect);
    offsetY = Math.round((srcHeight - visibleHeight) / 2);
  }

  const insetX = Math.round(visibleWidth * guideInsetRatio);
  const insetY = Math.round(visibleHeight * guideInsetRatio);

  return {
    x: Math.max(0, offsetX + insetX),
    y: Math.max(0, offsetY + insetY),
    width: Math.min(srcWidth, visibleWidth - (insetX * 2)),
    height: Math.min(srcHeight, visibleHeight - (insetY * 2)),
    autoCropped: true,
  };
}

/**
 * Downsamples and compresses an image source to JPEG Blob <= 300KB using canvas.
 * Supports canvasFactory injection for Node/headless testing.
 * Supports optional cropRect for viewfinder auto-cropping.
 *
 * @param {Blob|HTMLImageElement|ImageBitmap|Object} source - Image source or dimensions mock
 * @param {Object} [options]
 * @param {number} [options.maxDimension=1600] - Ceiling dimension
 * @param {number} [options.quality=0.8] - JPEG compression quality (0.0 to 1.0)
 * @param {Function} [options.canvasFactory=null] - Factory producing a canvas element
 * @param {string} [options.mimeType='image/jpeg'] - Target MIME type
 * @param {Object} [options.cropRect=null] - Optional bounding box {x, y, width, height}
 * @returns {Promise<Blob>}
 */
export async function compressImageToBlob(source, options = {}) {
  const {
    maxDimension = 1600,
    quality = 0.8,
    canvasFactory = null,
    mimeType = 'image/jpeg',
    cropRect = null,
  } = options;

  let imageElement = source;
  let objectUrlToRevoke = null;

  // Handle Blob / File input in browser environment
  if (typeof Blob !== 'undefined' && source instanceof Blob) {
    if (typeof createImageBitmap === 'function') {
      try {
        imageElement = await createImageBitmap(source, { imageOrientation: 'from-image' });
      } catch (_) {
        // Fallback to Image element
      }
    }

    if (imageElement === source && typeof Image !== 'undefined' && typeof URL !== 'undefined') {
      imageElement = await new Promise((resolve, reject) => {
        const img = new Image();
        objectUrlToRevoke = URL.createObjectURL(source);
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error('Failed to load image from Blob'));
        img.src = objectUrlToRevoke;
      });
    }
  }

  const rawWidth =
    imageElement.videoWidth ||
    imageElement.naturalWidth ||
    imageElement.width;
  const rawHeight =
    imageElement.videoHeight ||
    imageElement.naturalHeight ||
    imageElement.height;

  if (!rawWidth || !rawHeight) {
    if (objectUrlToRevoke && typeof URL !== 'undefined') {
      URL.revokeObjectURL(objectUrlToRevoke);
    }
    throw new Error('Cannot determine image dimensions');
  }

  const srcWidth = cropRect ? cropRect.width : rawWidth;
  const srcHeight = cropRect ? cropRect.height : rawHeight;

  const dims = calculateDownscaleDimensions(srcWidth, srcHeight, maxDimension);

  let canvas;
  if (typeof canvasFactory === 'function') {
    canvas = canvasFactory();
  } else if (typeof document !== 'undefined' && document.createElement) {
    canvas = document.createElement('canvas');
  } else {
    if (objectUrlToRevoke && typeof URL !== 'undefined') {
      URL.revokeObjectURL(objectUrlToRevoke);
    }
    throw new Error('Canvas unavailable: supply canvasFactory in headless environments');
  }

  canvas.width = dims.width;
  canvas.height = dims.height;

  const ctx = canvas.getContext('2d');
  if (!ctx) {
    if (objectUrlToRevoke && typeof URL !== 'undefined') {
      URL.revokeObjectURL(objectUrlToRevoke);
    }
    throw new Error('Could not obtain 2D canvas context');
  }

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  if (cropRect) {
    ctx.drawImage(imageElement, cropRect.x, cropRect.y, cropRect.width, cropRect.height, 0, 0, dims.width, dims.height);
  } else {
    ctx.drawImage(imageElement, 0, 0, dims.width, dims.height);
  }

  if (objectUrlToRevoke && typeof URL !== 'undefined') {
    URL.revokeObjectURL(objectUrlToRevoke);
  }

  if (typeof canvas.toBlob === 'function') {
    return new Promise((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (!blob) {
          reject(new Error('Canvas toBlob returned null'));
          return;
        }
        resolve(blob);
      }, mimeType, quality);
    });
  }

  if (typeof canvas.toDataURL === 'function') {
    const dataUrl = canvas.toDataURL(mimeType, quality);
    const parts = dataUrl.split(',');
    const byteString = atob(parts[1]);
    const ab = new ArrayBuffer(byteString.length);
    const ia = new Uint8Array(ab);
    for (let i = 0; i < byteString.length; i++) {
      ia[i] = byteString.charCodeAt(i);
    }
    return new Blob([ab], { type: mimeType });
  }

  throw new Error('Canvas does not support toBlob or toDataURL');
}

/**
 * Rotates an image source by specified degrees (90, 180, 270) and returns a JPEG Blob <= 300KB.
 * Supports canvasFactory injection for Node.js test environments.
 *
 * @param {Blob|HTMLImageElement|ImageBitmap|Object} source - Image source or dimensions mock
 * @param {number} [degrees=90] - Rotation angle in degrees clockwise
 * @param {Object} [options]
 * @param {number} [options.maxDimension=1600] - Ceiling dimension
 * @param {number} [options.quality=0.8] - JPEG compression quality
 * @param {Function} [options.canvasFactory=null] - Factory producing a canvas element
 * @param {string} [options.mimeType='image/jpeg'] - Output MIME type
 * @returns {Promise<Blob>}
 */
export async function rotateImageBlob(source, degrees = 90, options = {}) {
  const {
    maxDimension = 1600,
    quality = 0.8,
    canvasFactory = null,
    mimeType = 'image/jpeg',
    cropRect = null,
  } = options;

  let imageElement = source;
  let objectUrlToRevoke = null;

  if (typeof Blob !== 'undefined' && source instanceof Blob) {
    if (typeof createImageBitmap === 'function') {
      try {
        imageElement = await createImageBitmap(source, { imageOrientation: 'from-image' });
      } catch (_) {
        // Fallback to Image element
      }
    }

    if (imageElement === source && typeof Image !== 'undefined' && typeof URL !== 'undefined') {
      imageElement = await new Promise((resolve, reject) => {
        const img = new Image();
        objectUrlToRevoke = URL.createObjectURL(source);
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error('Failed to load image from Blob for rotation'));
        img.src = objectUrlToRevoke;
      });
    }
  }

  const rawWidth =
    imageElement.videoWidth ||
    imageElement.naturalWidth ||
    imageElement.width;
  const rawHeight =
    imageElement.videoHeight ||
    imageElement.naturalHeight ||
    imageElement.height;

  if (!rawWidth || !rawHeight) {
    if (objectUrlToRevoke && typeof URL !== 'undefined') {
      URL.revokeObjectURL(objectUrlToRevoke);
    }
    throw new Error('Cannot determine image dimensions for rotation');
  }

  const srcWidth = cropRect ? cropRect.width : rawWidth;
  const srcHeight = cropRect ? cropRect.height : rawHeight;

  const dims = calculateDownscaleDimensions(srcWidth, srcHeight, maxDimension);
  const normDeg = ((degrees % 360) + 360) % 360;
  const isSwap = normDeg === 90 || normDeg === 270;

  let canvas;
  if (typeof canvasFactory === 'function') {
    canvas = canvasFactory();
  } else if (typeof document !== 'undefined' && document.createElement) {
    canvas = document.createElement('canvas');
  } else {
    if (objectUrlToRevoke && typeof URL !== 'undefined') {
      URL.revokeObjectURL(objectUrlToRevoke);
    }
    throw new Error('Canvas unavailable: supply canvasFactory in headless environments');
  }

  canvas.width = isSwap ? dims.height : dims.width;
  canvas.height = isSwap ? dims.width : dims.height;

  const ctx = canvas.getContext('2d');
  if (!ctx) {
    if (objectUrlToRevoke && typeof URL !== 'undefined') {
      URL.revokeObjectURL(objectUrlToRevoke);
    }
    throw new Error('Could not obtain 2D canvas context for rotation');
  }

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  if (normDeg === 90) {
    ctx.translate(canvas.width, 0);
    ctx.rotate(Math.PI / 2);
  } else if (normDeg === 180) {
    ctx.translate(canvas.width, canvas.height);
    ctx.rotate(Math.PI);
  } else if (normDeg === 270) {
    ctx.translate(0, canvas.height);
    ctx.rotate((3 * Math.PI) / 2);
  } else {
    ctx.translate(0, 0);
    ctx.rotate(0);
  }

  if (cropRect) {
    ctx.drawImage(imageElement, cropRect.x, cropRect.y, cropRect.width, cropRect.height, 0, 0, dims.width, dims.height);
  } else {
    ctx.drawImage(imageElement, 0, 0, dims.width, dims.height);
  }

  if (objectUrlToRevoke && typeof URL !== 'undefined') {
    URL.revokeObjectURL(objectUrlToRevoke);
  }

  if (typeof canvas.toBlob === 'function') {
    return new Promise((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (!blob) {
          reject(new Error('Canvas toBlob returned null'));
          return;
        }
        resolve(blob);
      }, mimeType, quality);
    });
  }

  if (typeof canvas.toDataURL === 'function') {
    const dataUrl = canvas.toDataURL(mimeType, quality);
    const parts = dataUrl.split(',');
    const byteString = atob(parts[1]);
    const ab = new ArrayBuffer(byteString.length);
    const ia = new Uint8Array(ab);
    for (let i = 0; i < byteString.length; i++) {
      ia[i] = byteString.charCodeAt(i);
    }
    return new Blob([ab], { type: mimeType });
  }

  throw new Error('Canvas does not support toBlob or toDataURL');
}

/**
 * CameraTrayUI controller binding state to DOM elements:
 * - Live camera continuous scanning (<video id="camera-feed">)
 * - In-browser instant snapshot shutter button with flash & haptic feedback
 * - Latest captured page card preview with prominent "↩️ Retake" button
 * - Next-step guidance prompt ("Flip to Page X+1 and tap Snap 📷")
 * - Camera capture <input type="file" capture="environment"> & file picker fallback
 * - Filmstrip tray container with reorder / delete buttons
 * - Live compression metrics display
 * - Analyze upload button submitting to /api/analyze-book
 */
export class CameraTrayUI {
  constructor(options = {}) {
    this.state = options.state || new CameraTrayState({
      maxPages: options.maxPages || 20,
      autoSequence: options.autoSequence ?? true,
    });
    this.maxDimension = options.maxDimension ?? 1600;
    this.quality = options.quality ?? 0.8;
    this.apiEndpoint = options.apiEndpoint || '/api/analyze-book';
    this.headers = options.headers || null;
    this.getHeaders = options.getHeaders || null;

    this.fileInput = this._resolveElement(options.fileInput);
    this.cameraInput = this._resolveElement(options.cameraInput);
    this.videoElement = this._resolveElement(options.videoElement);
    this.viewfinder = this._resolveElement(options.viewfinderElement || options.viewfinder);
    this.shutterButton = this._resolveElement(options.shutterButton);
    this.retakeButton = this._resolveElement(options.retakeButton);
    this.toggleFallbackButton = this._resolveElement(options.toggleFallbackButton);
    this.latestCardElement = this._resolveElement(options.latestCardElement);
    this.nextStepPromptElement = this._resolveElement(options.nextStepPromptElement);
    this.trayElement = this._resolveElement(options.trayElement);
    this.metricsElement = this._resolveElement(options.metricsElement);
    this.statusElement = this._resolveElement(options.statusElement);
    this.analyzeButton = this._resolveElement(options.analyzeButton);
    this.clearButton = this._resolveElement(options.clearButton);
    this.carouselElement = this._resolveElement(options.carouselElement || '#book-carousel');
    this.carouselDotsElement = this._resolveElement(options.carouselDotsElement || '#book-carousel-dots');
    this.rotateViewfinderButton = this._resolveElement(options.rotateViewfinderButton || '#btn-rotate-viewfinder');
    this.autoStraightenButton = this._resolveElement(options.autoStraightenButton || '#btn-auto-straighten');
    this.drawerElement = this._resolveElement(options.drawerElement || '#review-drawer');
    this.backdropElement = this._resolveElement(options.backdropElement || '#drawer-backdrop');
    this.closeDrawerButton = this._resolveElement(options.closeDrawerButton || '#btn-close-drawer');
    this.openReviewButton = this._resolveElement(options.openReviewButton || '#btn-open-review');
    this.latestPreviewPill = this._resolveElement(options.latestPreviewPill || '#pill-latest-preview');
    this.drawerCountBadge = this._resolveElement(options.drawerCountBadge || '#drawer-count-badge');
    this.sequenceSwitcherElement = this._resolveElement(options.sequenceSwitcherElement || '#sequence-switcher-container');
    this.toggleResultsButton = this._resolveElement(options.toggleResultsButton || '#btn-toggle-results');
    this.resultsDisplay = this._resolveElement(options.resultsDisplay || '#results-display');
    this.activeSequenceBadge = this._resolveElement(options.activeSequenceBadge || '#active-sequence-badge');

    // Chapter-based scanning controls
    this.scanChapterBar = this._resolveElement(options.scanChapterBar || '#scan-chapter-bar');
    this.scanChapterLabel = this._resolveElement(options.scanChapterLabel || '#scan-chapter-label');
    this.btnAddChapter = this._resolveElement(options.btnAddChapter || '#btn-add-chapter');

    this.canvasFactory = options.canvasFactory || null;
    this.windowObj = options.windowObj || null;

    this.onAnalyzeSuccess = options.onAnalyzeSuccess || null;
    this.onAnalyzeError = options.onAnalyzeError || null;
    this.onPagesChanged = options.onPagesChanged || null;
    this.onStartReading = options.onStartReading || null;
    this.isQuestionReadyForPage = options.isQuestionReadyForPage || null;
    this.onAskPageQuestion = options.onAskPageQuestion || null;
    this.onActivePageChange = options.onActivePageChange || null;
    this.lastAnalysisData = null;

    this.activeStream = null;
    this.cameraActive = false;
    this.isCapturing = false;
    this.useFallback = false;

    this._bindEvents();

    if (this.videoElement && (options.autoStartCamera ?? true)) {
      this.startCamera(this.videoElement);
    }

    this.render();
  }

  _resolveElement(el) {
    if (!el) return null;
    if (typeof el === 'string') {
      return typeof document !== 'undefined' ? document.querySelector(el) : null;
    }
    return el;
  }

  _bindEvents() {
    if (this.shutterButton) {
      this.shutterButton.addEventListener('click', () => this.snapPhoto());
    }
    if (this.retakeButton) {
      this.retakeButton.addEventListener('click', () => this.retakeLastPage());
    }
    if (this.rotateViewfinderButton) {
      this.rotateViewfinderButton.addEventListener('click', () => this.rotateLastPage());
    }
    if (this.autoStraightenButton) {
      this.autoStraightenButton.addEventListener('click', () => this.autoStraightenAll());
    }
    if (this.toggleFallbackButton) {
      this.toggleFallbackButton.addEventListener('click', () => this.toggleFallback());
    }
    if (this.fileInput) {
      this.fileInput.addEventListener('change', (e) => this.handleFileSelection(e));
    }
    if (this.cameraInput) {
      this.cameraInput.addEventListener('change', (e) => this.handleFileSelection(e));
    }
    if (this.analyzeButton) {
      this.analyzeButton.addEventListener('click', () => this.handleAnalyze());
    }
    if (this.clearButton) {
      this._bindTrashConfirmation();
    }
    if (this.btnAddChapter) {
      this.btnAddChapter.addEventListener('click', () => this.addChapter());
    }
    if (this.openReviewButton) {
      this.openReviewButton.addEventListener('click', () => this.openDrawer());
    }
    if (this.latestPreviewPill) {
      this.latestPreviewPill.addEventListener('click', () => this.openDrawer());
    }
    if (this.closeDrawerButton) {
      this.closeDrawerButton.addEventListener('click', () => this.closeDrawer());
      this.closeDrawerButton.addEventListener('touchend', (e) => {
        e.preventDefault();
        this.closeDrawer();
      });
    }
    if (this.backdropElement) {
      this.backdropElement.addEventListener('click', () => this.closeDrawer());
      this.backdropElement.addEventListener('touchend', (e) => {
        e.preventDefault();
        this.closeDrawer();
      });
    }
    if (this.toggleResultsButton) {
      this.toggleResultsButton.addEventListener('click', () => this.toggleResults());
    }

    // Touch swipe-down drag-to-dismiss gesture for the review drawer
    if (this.drawerElement) {
      let touchStartY = 0;
      let currentDeltaY = 0;
      let isDragging = false;

      const onTouchStart = (e) => {
        if (!this.isDrawerOpen() || !e.touches || e.touches.length === 0) return;
        const target = e.target;
        const isHandleOrHeader = target.closest && (target.closest('.drawer-handle-bar') || target.closest('.drawer-header'));
        const isAtTop = (this.drawerElement.scrollTop || 0) <= 2;

        if (isHandleOrHeader || isAtTop) {
          touchStartY = e.touches[0].clientY;
          currentDeltaY = 0;
          isDragging = true;
          this.drawerElement.style.transition = 'none';
        }
      };

      const onTouchMove = (e) => {
        if (!isDragging || !e.touches || e.touches.length === 0) return;
        const currentY = e.touches[0].clientY;
        const delta = currentY - touchStartY;

        if (delta > 0) {
          currentDeltaY = delta;
          this.drawerElement.style.transform = `translateY(${delta}px)`;
          if (this.backdropElement) {
            const opacity = Math.max(0, 1 - delta / 350);
            this.backdropElement.style.opacity = String(opacity);
          }
          if (e.cancelable) e.preventDefault();
        } else {
          currentDeltaY = 0;
          this.drawerElement.style.transform = '';
        }
      };

      const onTouchEnd = () => {
        if (!isDragging) return;
        isDragging = false;
        this.drawerElement.style.transition = '';

        if (currentDeltaY > 80) {
          this.closeDrawer();
        } else {
          this.drawerElement.style.transform = '';
          if (this.backdropElement) {
            this.backdropElement.style.opacity = '';
          }
        }
        currentDeltaY = 0;
      };

      this.drawerElement.addEventListener('touchstart', onTouchStart, { passive: true });
      this.drawerElement.addEventListener('touchmove', onTouchMove, { passive: false });
      this.drawerElement.addEventListener('touchend', onTouchEnd, { passive: true });
      this.drawerElement.addEventListener('touchcancel', onTouchEnd, { passive: true });
    }

    if (typeof document !== 'undefined') {
      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && this.isDrawerOpen()) {
          this.closeDrawer();
        }
      });
    }
  }

  /**
   * Starts in-browser live camera stream using getUserMedia.
   *
   * @param {HTMLVideoElement|string} [videoElement]
   * @returns {Promise<boolean>} True if camera started successfully
   */
  async startCamera(videoElement = null) {
    const video = this._resolveElement(videoElement) || this.videoElement;
    if (!video) return false;
    this.videoElement = video;

    if (!navigator?.mediaDevices?.getUserMedia) {
      this.setStatus('Camera API not supported in this browser. Switched to upload fallback.', 'warning');
      this.cameraActive = false;
      this.useFallback = true;
      this._updateCameraUI();
      return false;
    }

    try {
      if (this.activeStream) {
        this.stopCamera();
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
        audio: false,
      });

      this.activeStream = stream;
      this.videoElement.srcObject = stream;
      await this.videoElement.play().catch(() => {});
      this.cameraActive = true;
      this.useFallback = false;
      this._updateCameraUI();
      this.setStatus('Live camera ready. Frame book page and tap Snap 📷', 'info');
      return true;
    } catch (err) {
      console.warn('getUserMedia failed:', err);
      this.cameraActive = false;
      this.activeStream = null;
      this.useFallback = true;
      this._updateCameraUI();
      this.setStatus('Camera permission denied or camera unavailable. Switched to photo upload fallback.', 'warning');
      return false;
    }
  }

  /**
   * Stops active camera video tracks.
   */
  stopCamera() {
    if (this.activeStream) {
      this.activeStream.getTracks().forEach((track) => track.stop());
      this.activeStream = null;
    }
    if (this.videoElement) {
      this.videoElement.srcObject = null;
    }
    this.cameraActive = false;
    this._updateCameraUI();
  }

  _updateCameraUI() {
    if (this.viewfinder) {
      this.viewfinder.classList.toggle('camera-active', this.cameraActive);
      this.viewfinder.classList.toggle('camera-fallback', !this.cameraActive);
    }
  }

  /**
   * Toggles between live camera viewfinder and file upload fallback mode.
   */
  toggleFallback() {
    if (this.cameraActive) {
      this.stopCamera();
      this.useFallback = true;
      this.setStatus('Switched to file upload / camera fallback mode.', 'info');
    } else {
      this.useFallback = false;
      this.startCamera(this.videoElement);
    }
  }

  /**
   * Opens the collapsible bottom sheet review drawer.
   */
  openDrawer() {
    if (this.drawerElement) {
      this.drawerElement.classList.add('drawer-open');
      this.drawerElement.setAttribute('aria-hidden', 'false');
    }
    if (this.backdropElement) {
      this.backdropElement.classList.add('backdrop-active');
      this.backdropElement.setAttribute('aria-hidden', 'false');
    }
    this.scanSidewaysPages().catch((err) => {
      console.warn('Background scanSidewaysPages error:', err);
    });
  }

  /**
   * Closes the collapsible bottom sheet review drawer.
   */
  closeDrawer() {
    if (this.drawerElement) {
      this.drawerElement.style.transform = '';
      this.drawerElement.style.transition = '';
      this.drawerElement.classList.remove('drawer-open');
      this.drawerElement.setAttribute('aria-hidden', 'true');
    }
    if (this.backdropElement) {
      this.backdropElement.style.opacity = '';
      this.backdropElement.classList.remove('backdrop-active');
      this.backdropElement.setAttribute('aria-hidden', 'true');
    }
  }

  /**
   * Toggles the review drawer open or closed.
   */
  toggleDrawer() {
    if (this.isDrawerOpen()) {
      this.closeDrawer();
    } else {
      this.openDrawer();
    }
  }

  /**
   * Checks whether review drawer is currently open.
   * @returns {boolean}
   */
  isDrawerOpen() {
    return !!this.drawerElement?.classList?.contains('drawer-open');
  }

  /**
   * Captures an instant snapshot directly from active <video> in <15ms
   * without closing the camera or navigating away.
   */
  async snapPhoto() {
    if (this.isCapturing) return;

    if (this.state.isFull()) {
      this.setStatus(`Maximum ${this.state.maxPages} pages ceiling reached.`, 'warning');
      return;
    }

    // Graceful fallback: If camera is inactive or not ready, trigger native camera or file input
    if (!this.cameraActive || !this.videoElement || !this.videoElement.videoWidth) {
      if (this.cameraInput) {
        this.cameraInput.click();
      } else if (this.fileInput) {
        this.fileInput.click();
      }
      return;
    }

    this.isCapturing = true;
    const startTime = performance.now();

    // Trigger visual shutter flash effect on viewfinder
    this._triggerShutterFlash();

    // Optional haptic vibration feedback
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      try {
        navigator.vibrate([40]);
      } catch (_) {}
    }

    try {
      const origWidth = this.videoElement.videoWidth;
      const origHeight = this.videoElement.videoHeight;

      // Auto-crop to framing guide area (eliminates background desks, keyboards, and black margins)
      const cropRect = calculateAutoCropRect(this.videoElement, {
        targetAspect: 0.75,
        guideInsetRatio: 0.04,
      });

      const windowObj = this.windowObj || (typeof window !== 'undefined' ? window : null);
      const deviceRotation = detectDeviceRotation(windowObj);

      let compressedBlob;
      let compDims;
      if (deviceRotation !== 0) {
        compressedBlob = await rotateImageBlob(this.videoElement, deviceRotation, {
          maxDimension: this.maxDimension,
          quality: this.quality,
          canvasFactory: this.canvasFactory,
          cropRect,
        });
        const dims = calculateDownscaleDimensions(cropRect.width, cropRect.height, this.maxDimension);
        const isSwap = deviceRotation === 90 || deviceRotation === 270;
        compDims = {
          width: isSwap ? dims.height : dims.width,
          height: isSwap ? dims.width : dims.height,
        };
      } else {
        compressedBlob = await compressImageToBlob(this.videoElement, {
          maxDimension: this.maxDimension,
          quality: this.quality,
          canvasFactory: this.canvasFactory,
          cropRect,
        });
        compDims = calculateDownscaleDimensions(cropRect.width, cropRect.height, this.maxDimension);
      }

      const captureDurationMs = Math.round(performance.now() - startTime);
      const compSizeKB = (compressedBlob.size / 1024).toFixed(1);

      const previewUrl = typeof URL !== 'undefined' ? URL.createObjectURL(compressedBlob) : null;

      const metrics = {
        originalWidth: origWidth,
        originalHeight: origHeight,
        originalSizeKB: 'LiveFrame',
        compressedWidth: compDims.width,
        compressedHeight: compDims.height,
        compressedSizeKB: compSizeKB,
        durationMs: captureDurationMs,
      };

      const pageNumber = this.state.pages.length + 1;
      this.state.addPage({
        blob: compressedBlob,
        width: compDims.width,
        height: compDims.height,
        originalName: `live_scan_page_${pageNumber}.jpg`,
        previewUrl,
        metrics,
      });

      this.renderMetrics(metrics);
      this.render();

      if (this.onPagesChanged) {
        this.onPagesChanged(this.state.pages);
      }
    } catch (err) {
      console.error('Live camera snapshot failed:', err);
      this.setStatus(`Capture failed: ${err.message}`, 'error');
    } finally {
      this.isCapturing = false;
    }
  }

  _triggerShutterFlash() {
    if (!this.viewfinder) return;
    const flashEl = this.viewfinder.querySelector('.shutter-flash') || this.viewfinder;
    flashEl.classList.remove('active-flash');
    void flashEl.offsetWidth; // Force CSS reflow
    flashEl.classList.add('active-flash');
    setTimeout(() => {
      flashEl.classList.remove('active-flash');
    }, 250);
  }

  /**
   * Retakes the last captured page, removing it and updating UI.
   *
   * @returns {Object|null}
   */
  retakeLastPage() {
    const retaken = this.state.retakeLastPage();
    if (retaken) {
      this.setStatus(`Retook Page ${retaken.pageNumber}. Ready for new capture.`, 'info');
      this.render();
      if (this.onPagesChanged) {
        this.onPagesChanged(this.state.pages);
      }
    }
    return retaken;
  }

  /**
   * Rotates a specific page by degrees, updates preview URL and state, and re-renders.
   *
   * @param {string} pageId
   * @param {number} [degrees=90]
   * @returns {Promise<Object|null>}
   */
  async rotatePage(pageId, degrees = 90) {
    const page = this.state.pages.find((p) => p.id === pageId);
    if (!page) return null;

    try {
      this.setStatus(`Rotating Page ${page.pageNumber}...`, 'info');
      const rotatedBlob = await rotateImageBlob(page.blob, degrees, {
        maxDimension: this.maxDimension,
        quality: this.quality,
      });

      if (page.previewUrl && typeof URL !== 'undefined' && URL.revokeObjectURL) {
        try {
          URL.revokeObjectURL(page.previewUrl);
        } catch (_) {}
      }

      const newPreviewUrl = typeof URL !== 'undefined' ? URL.createObjectURL(rotatedBlob) : null;
      page.previewUrl = newPreviewUrl;

      const updated = this.state.rotatePage(pageId, degrees, rotatedBlob);
      this.setStatus(`Page ${page.pageNumber} rotated ${degrees}°.`, 'success');
      this.render();

      if (this.onPagesChanged) {
        this.onPagesChanged(this.state.pages);
      }
      return updated;
    } catch (err) {
      console.error('Rotate page error:', err);
      this.setStatus(`Rotation failed: ${err.message}`, 'error');
      return null;
    }
  }

  /**
   * One-tap helper rotating the most recently captured page.
   *
   * @param {number} [degrees=90]
   * @returns {Promise<Object|null>}
   */
  async rotateLastPage(degrees = 90) {
    if (this.state.isEmpty()) return null;
    const lastPage = this.state.pages[this.state.pages.length - 1];
    return this.rotatePage(lastPage.id, degrees);
  }

  /**
   * Automatically inspects text line orientation without AI using detectCanvasOrientation
   * and straightens sideways pages (90° rotation) if detected.
   *
   * @param {string} pageId - ID of page to analyze and straighten
   * @returns {Promise<Object|null>} Updated page record or null if not found
   */
  async autoStraightenPage(pageId) {
    const page = this.state.pages.find((p) => p.id === pageId);
    if (!page || !page.blob) return null;

    try {
      this.setStatus(`Detecting text orientation for Page ${page.pageNumber}...`, 'info');

      let imageElement = null;
      let objectUrlToRevoke = null;

      if (typeof createImageBitmap === 'function') {
        try {
          imageElement = await createImageBitmap(page.blob);
        } catch (_) {}
      }

      if (!imageElement && typeof Image !== 'undefined' && typeof URL !== 'undefined') {
        imageElement = await new Promise((resolve, reject) => {
          const img = new Image();
          objectUrlToRevoke = URL.createObjectURL(page.blob);
          img.onload = () => resolve(img);
          img.onerror = () => reject(new Error('Failed to load image for orientation detection'));
          img.src = objectUrlToRevoke;
        });
      }

      const imgWidth = imageElement?.width || page.width || 240;
      const imgHeight = imageElement?.height || page.height || 240;
      const testDims = calculateDownscaleDimensions(imgWidth, imgHeight, 240);

      let canvas;
      if (typeof this.canvasFactory === 'function') {
        canvas = this.canvasFactory();
      } else if (typeof document !== 'undefined' && document.createElement) {
        canvas = document.createElement('canvas');
      } else {
        throw new Error('Canvas unavailable for orientation analysis');
      }

      canvas.width = testDims.width;
      canvas.height = testDims.height;

      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Could not obtain canvas context');

      if (imageElement) {
        ctx.drawImage(imageElement, 0, 0, testDims.width, testDims.height);
      }

      if (objectUrlToRevoke && typeof URL !== 'undefined') {
        URL.revokeObjectURL(objectUrlToRevoke);
      }
      if (imageElement && typeof imageElement.close === 'function') {
        imageElement.close();
      }

      const orientation = detectCanvasOrientation(canvas);

      if (orientation.isSideways && orientation.recommendedRotation > 0) {
        this.setStatus(`Page ${page.pageNumber} detected sideways. Auto-straightening (${orientation.recommendedRotation}°)...`, 'info');
        const updated = await this.rotatePage(pageId, orientation.recommendedRotation);
        if (updated) {
          updated.isSidewaysDetected = false;
        }
        page.isSidewaysDetected = false;
        this._updateAutoStraightenButton();
        this.setStatus(`✨ Page ${page.pageNumber} automatically straightened!`, 'success');
        return updated;
      } else {
        page.isSidewaysDetected = false;
        this._updateAutoStraightenButton();
        this.setStatus(`Page ${page.pageNumber} is already upright!`, 'info');
        return page;
      }
    } catch (err) {
      console.error('Auto-straighten failed:', err);
      this.setStatus(`Auto-straighten failed: ${err.message}`, 'error');
      return null;
    }
  }

  /**
   * Fast non-AI inspection checking whether a page is sideways using a downscaled 240px canvas.
   *
   * @param {Object} page
   * @returns {Promise<boolean>}
   */
  async checkPageSideways(page) {
    if (!page || !page.blob) return false;
    try {
      let imageElement = null;
      let objectUrlToRevoke = null;

      if (typeof createImageBitmap === 'function') {
        try {
          imageElement = await createImageBitmap(page.blob);
        } catch (_) {}
      }

      if (!imageElement && typeof Image !== 'undefined' && typeof URL !== 'undefined') {
        imageElement = await new Promise((resolve, reject) => {
          const img = new Image();
          objectUrlToRevoke = URL.createObjectURL(page.blob);
          img.onload = () => resolve(img);
          img.onerror = () => reject(new Error('Failed to load image for orientation detection'));
          img.src = objectUrlToRevoke;
        });
      }

      const imgWidth = imageElement?.width || page.width || 240;
      const imgHeight = imageElement?.height || page.height || 240;
      const testDims = calculateDownscaleDimensions(imgWidth, imgHeight, 240);

      let canvas;
      if (typeof this.canvasFactory === 'function') {
        canvas = this.canvasFactory();
      } else if (typeof document !== 'undefined' && document.createElement) {
        canvas = document.createElement('canvas');
      } else {
        return false;
      }

      canvas.width = testDims.width;
      canvas.height = testDims.height;

      const ctx = canvas.getContext('2d');
      if (!ctx) return false;

      if (imageElement) {
        ctx.drawImage(imageElement, 0, 0, testDims.width, testDims.height);
      }

      if (objectUrlToRevoke && typeof URL !== 'undefined') {
        URL.revokeObjectURL(objectUrlToRevoke);
      }
      if (imageElement && typeof imageElement.close === 'function') {
        imageElement.close();
      }

      const orientation = detectCanvasOrientation(canvas);
      return Boolean(orientation.isSideways && orientation.recommendedRotation > 0);
    } catch (_) {
      return false;
    }
  }

  /**
   * Proactively scans all pages in active sequence in the background,
   * tagging pages with isSidewaysDetected and updating UI badges.
   *
   * @returns {Promise<Array<Object>>} List of detected sideways pages
   */
  async scanSidewaysPages() {
    if (this.state.isEmpty()) return [];
    let detectedCount = 0;
    for (const page of this.state.pages) {
      try {
        const isSideways = await this.checkPageSideways(page);
        page.isSidewaysDetected = isSideways;
        if (isSideways) detectedCount++;
      } catch (err) {
        console.warn('Scan sideways error for page', page.pageNumber, err);
      }
    }
    this.renderCarousel();
    this._updateAutoStraightenButton();
    return this.state.pages.filter((p) => p.isSidewaysDetected);
  }

  /**
   * Updates the auto-straighten button state and text with detected sideways count.
   */
  _updateAutoStraightenButton() {
    if (this.autoStraightenButton) {
      this.autoStraightenButton.disabled = this.state.isEmpty();
      const detectedCount = this.state.pages.filter((p) => p.isSidewaysDetected).length;
      if (detectedCount > 0) {
        this.autoStraightenButton.textContent = `✨ Auto-Straighten (${detectedCount} Detected)`;
        this.autoStraightenButton.classList.add('has-detected');
      } else {
        this.autoStraightenButton.textContent = '✨ Auto-Straighten';
        this.autoStraightenButton.classList.remove('has-detected');
      }
    }
  }

  /**
   * Automatically straightens the most recently captured page.
   * @returns {Promise<Object|null>}
   */
  async autoStraightenLastPage() {
    if (this.state.isEmpty()) return null;
    const lastPage = this.state.pages[this.state.pages.length - 1];
    return this.autoStraightenPage(lastPage.id);
  }

  /**
   * Automatically straightens all pages in active sequence.
   * @returns {Promise<Array<Object>>}
   */
  async autoStraightenAll() {
    if (this.state.isEmpty()) return [];
    const results = [];
    for (const page of [...this.state.pages]) {
      const res = await this.autoStraightenPage(page.id);
      if (res) results.push(res);
    }
    return results;
  }

  async handleFileSelection(event) {
    const files = event.target?.files ? Array.from(event.target.files) : [];
    if (!files.length) return;

    if (event.target) {
      event.target.value = '';
    }

    this.setStatus(`Processing ${files.length} photo${files.length > 1 ? 's' : ''}...`, 'info');

    for (const file of files) {
      if (this.state.isFull()) {
        this.setStatus(`Maximum ${this.state.maxPages} pages ceiling reached.`, 'warning');
        break;
      }

      try {
        const startTime = performance.now();
        const origSizeKB = (file.size / 1024).toFixed(1);

        const origDims = await this._getImageDimensions(file);

        const compressedBlob = await compressImageToBlob(file, {
          maxDimension: this.maxDimension,
          quality: this.quality,
        });

        const durationMs = Math.round(performance.now() - startTime);
        const compSizeKB = (compressedBlob.size / 1024).toFixed(1);
        const compDims = calculateDownscaleDimensions(origDims.width, origDims.height, this.maxDimension);

        const previewUrl = typeof URL !== 'undefined' ? URL.createObjectURL(compressedBlob) : null;

        const metrics = {
          originalWidth: origDims.width,
          originalHeight: origDims.height,
          originalSizeKB: origSizeKB,
          compressedWidth: compDims.width,
          compressedHeight: compDims.height,
          compressedSizeKB: compSizeKB,
          durationMs,
        };

        this.state.addPage({
          blob: compressedBlob,
          width: compDims.width,
          height: compDims.height,
          originalName: file.name,
          previewUrl,
          metrics,
        });

        this.renderMetrics(metrics);
        this.render();

        if (this.onPagesChanged) {
          this.onPagesChanged(this.state.pages);
        }
      } catch (err) {
        console.error('Error processing image:', err);
        this.setStatus(`Failed to process ${file.name}: ${err.message}`, 'error');
      }
    }

    if (!this.state.isEmpty()) {
      this.setStatus(`${this.state.pages.length} page${this.state.pages.length > 1 ? 's' : ''} ready for analysis.`, 'success');
    }
  }

  async _getImageDimensions(file) {
    if (typeof createImageBitmap === 'function') {
      try {
        const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
        const width = bmp.width;
        const height = bmp.height;
        bmp.close();
        return { width, height };
      } catch (_) {}
    }

    return new Promise((resolve, reject) => {
      const img = new Image();
      const url = URL.createObjectURL(file);
      img.onload = () => {
        URL.revokeObjectURL(url);
        resolve({ width: img.naturalWidth || img.width, height: img.naturalHeight || img.height });
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error('Failed to load image file'));
      };
      img.src = url;
    });
  }

  async handleAnalyze() {
    // Auto-open drawer when user clicks Analyze
    this.openDrawer();

    if (this.state.isEmpty()) {
      this.setStatus('Please add at least one page to analyze.', 'warning');
      return;
    }

    this.setAnalyzing(true);
    this.setStatus(`Analyzing ${this.state.pages.length} page(s) with Gemini...`, 'info');

    try {
      const formData = this.state.createFormData('images');
      let requestHeaders = undefined;
      if (typeof this.getHeaders === 'function') {
        requestHeaders = this.getHeaders();
      } else if (this.headers && typeof this.headers === 'object') {
        requestHeaders = { ...this.headers };
      }

      const fetchOptions = {
        method: 'POST',
        body: formData,
      };
      if (requestHeaders && Object.keys(requestHeaders).length > 0) {
        fetchOptions.headers = requestHeaders;
      }

      const response = await fetch(this.apiEndpoint, fetchOptions);

      // Safely read response text first so non-JSON responses (e.g. 504 Gateway Timeout HTML, 413, 500)
      // do not cause Safari to throw "The string did not match the expected pattern" in response.json()
      let data = null;
      let rawText = '';
      try {
        rawText = await response.text();
        if (rawText && rawText.trim().length > 0) {
          data = JSON.parse(rawText);
        }
      } catch (_) {
        data = null;
      }

      if (!response.ok) {
        let errorMsg = data?.error_message || data?.error || data?.message;
        if (!errorMsg && rawText) {
          const titleMatch = rawText.match(/<title>([^<]+)<\/title>/i);
          const h1Match = rawText.match(/<h1>([^<]+)<\/h1>/i);
          if (titleMatch && titleMatch[1]) {
            errorMsg = titleMatch[1].trim();
          } else if (h1Match && h1Match[1]) {
            errorMsg = h1Match[1].trim();
          } else {
            const stripped = rawText.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
            if (stripped.length > 0 && stripped.length < 200) {
              errorMsg = stripped;
            }
          }
        }
        if (!errorMsg) {
          errorMsg = `HTTP ${response.status}${response.statusText ? ' ' + response.statusText : ''}`;
        }

        this.setStatus(`Analysis failed (${response.status}): ${errorMsg}`, 'error');
        if (this.toggleResultsButton) {
          this.toggleResultsButton.style.display = 'inline-flex';
          this.toggleResultsButton.textContent = '📊 View Analysis Results';
          this.toggleResultsButton.setAttribute('aria-expanded', 'false');
        }
        if (this.resultsDisplay) {
          this.resultsDisplay.style.display = 'none';
        }
        if (this.onAnalyzeError) {
          this.onAnalyzeError(data || { error: errorMsg, status: response.status }, response.status);
        }
        return;
      }

      if (!data) {
        throw new Error(`Server returned status ${response.status} with empty or non-JSON response.`);
      }

      this.setStatus(`✅ Book analysis complete! Extracted ${data.chunks?.length || 0} reading chunk(s).`, 'success');
      this.lastAnalysisData = data;
      this._renderAnalysisSuccessCard(data);
      if (this.toggleResultsButton) {
        this.toggleResultsButton.style.display = 'inline-flex';
        this.toggleResultsButton.textContent = '📊 View Analysis Results';
        this.toggleResultsButton.setAttribute('aria-expanded', 'false');
      }
      if (this.resultsDisplay) {
        this.resultsDisplay.style.display = 'none';
      }
      this.renderCarousel();
      this.updateQuestionButtonStates();
      if (this.onAnalyzeSuccess) {
        this.onAnalyzeSuccess(data);
      }
    } catch (err) {
      console.error('Upload / analyze error:', err);
      this.setStatus(`Network or server error: ${err.message}`, 'error');
      if (this.toggleResultsButton) {
        this.toggleResultsButton.style.display = 'inline-flex';
        this.toggleResultsButton.textContent = '📊 View Analysis Results';
        this.toggleResultsButton.setAttribute('aria-expanded', 'false');
      }
      if (this.resultsDisplay) {
        this.resultsDisplay.style.display = 'none';
      }
      if (this.onAnalyzeError) {
        this.onAnalyzeError(err);
      }
    } finally {
      this.setAnalyzing(false);
    }
  }

  /**
   * Toggles visibility of raw API analysis results on demand.
   */
  toggleResults() {
    if (!this.resultsDisplay) return;
    const isHidden = this.resultsDisplay.style.display === 'none' || !this.resultsDisplay.style.display;
    if (isHidden) {
      this.resultsDisplay.style.display = 'block';
      if (this.toggleResultsButton) {
        this.toggleResultsButton.textContent = '📊 Hide Analysis Results';
        this.toggleResultsButton.setAttribute('aria-expanded', 'true');
      }
    } else {
      this.resultsDisplay.style.display = 'none';
      if (this.toggleResultsButton) {
        this.toggleResultsButton.textContent = '📊 View Analysis Results';
        this.toggleResultsButton.setAttribute('aria-expanded', 'false');
      }
    }
  }

  /**
   * Renders celebratory "Start Reading" hero card inside the review drawer upon analysis completion.
   */
  /**
   * Configures analysis summary modal dialog and reveals compact header badge.
   * Does NOT take up screen space in the drawer body unless explicitly opened by user.
   */
  _renderAnalysisSuccessCard(data) {
    if (typeof document === 'undefined') return;

    const chunkCount = data.chunks?.length || 0;
    const descText = `${data.summary ? `<strong>${data.summary}</strong><br><br>` : ''}Gemini organized your pages into <strong>${chunkCount} reading chunk${chunkCount === 1 ? '' : 's'}</strong>.`;

    // 1. Ensure existing inline container takes up NO screen space
    const existingInline = document.getElementById('analysis-success-container');
    if (existingInline) {
      existingInline.innerHTML = '';
      existingInline.style.display = 'none';
    }

    // 2. Reveal header summary button if present
    const summaryBtn = document.getElementById('btn-show-analysis-summary');
    if (summaryBtn) {
      summaryBtn.style.display = 'inline-flex';
    }

    // 3. Locate or dynamically create modal elements
    let modal = document.getElementById('analysis-summary-modal');
    let backdrop = document.getElementById('analysis-summary-backdrop');

    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'analysis-summary-modal';
      modal.className = 'analysis-summary-modal-window';
      modal.setAttribute('role', 'dialog');
      modal.setAttribute('aria-modal', 'true');
      modal.style.display = 'none';

      backdrop = document.createElement('div');
      backdrop.id = 'analysis-summary-backdrop';
      backdrop.className = 'drawer-backdrop modal-backdrop';
      backdrop.style.display = 'none';

      document.body.appendChild(backdrop);
      document.body.appendChild(modal);
    }

    modal.innerHTML = `
      <div class="analysis-modal-header">
        <h3 id="analysis-modal-title" class="analysis-modal-title">🎉 Storybook Ready to Read!</h3>
        <button type="button" id="btn-close-analysis-modal" class="touch-btn btn-text-close" aria-label="Close story summary">✕</button>
      </div>
      <div class="analysis-modal-body">
        <p id="analysis-modal-desc" class="analysis-modal-desc">${descText}</p>
        <button type="button" id="btn-start-reading-hero" class="touch-btn btn-primary btn-cta btn-start-reading-hero" aria-label="Start Reading Storybook">
          🚀 Start Reading (Chunk 1) ➡️
        </button>
      </div>
    `;

    const openModal = () => {
      if (modal) modal.style.display = 'flex';
      if (backdrop) backdrop.style.display = 'block';
    };

    const closeModal = () => {
      if (modal) modal.style.display = 'none';
      if (backdrop) backdrop.style.display = 'none';
    };

    if (summaryBtn) {
      summaryBtn.onclick = (e) => {
        if (e) e.preventDefault();
        openModal();
      };
    }

    const closeBtn = modal.querySelector('#btn-close-analysis-modal');
    if (closeBtn) {
      closeBtn.onclick = (e) => {
        if (e) e.preventDefault();
        closeModal();
      };
    }

    if (backdrop) {
      backdrop.onclick = () => closeModal();
    }

    const startBtn = modal.querySelector('#btn-start-reading-hero');
    if (startBtn) {
      const handleStart = (e) => {
        if (e) e.preventDefault();
        closeModal();
        this.closeDrawer();
        if (this.onStartReading) {
          this.onStartReading(data);
        }
      };
      startBtn.onclick = handleStart;
    }
  }

  /**
   * Adds a new chapter sequence to the book.
   */
  addChapter() {
    this.state.startNewSequence();
    const chIdx = this.state.currentSequenceIndex + 1;
    this.setStatus(`Started Chapter ${chIdx}. Aim camera at Chapter ${chIdx}, Page 1!`, 'info');
    this.render();
    if (this.onPagesChanged) {
      this.onPagesChanged(this.state.pages);
    }
  }

  /**
   * Renders chapter sequence switcher.
   * Format: [📖 Chapter 1 (3 pgs)] [📖 Chapter 2 (2 pgs)] [➕ New Chapter]
   */
  renderSequenceSwitcher() {
    if (!this.sequenceSwitcherElement) return;

    const seqCount = this.state.getSequenceCount();
    this.sequenceSwitcherElement.style.display = 'flex';
    this.sequenceSwitcherElement.innerHTML = '';

    if (this.activeSequenceBadge) {
      this.activeSequenceBadge.style.display = 'inline-block';
      this.activeSequenceBadge.textContent = `📖 Chapter ${this.state.currentSequenceIndex + 1} of ${seqCount}`;
    }

    this.state.sequences.forEach((seq, index) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      const isActive = index === this.state.currentSequenceIndex;
      btn.className = `sequence-tab-btn chapter-tab-btn touch-btn${isActive ? ' active' : ''}`;
      btn.setAttribute('aria-selected', isActive ? 'true' : 'false');
      btn.setAttribute('aria-label', `Switch to Chapter ${index + 1} (${seq.length} Pages)`);
      btn.textContent = `📖 Chapter ${index + 1} (${seq.length} pgs)`;

      btn.addEventListener('click', () => {
        this.state.switchSequence(index);
        this.setStatus(`Switched to Chapter ${index + 1} (${seq.length} page${seq.length === 1 ? '' : 's'}).`, 'info');
        this.render();
        if (this.onPagesChanged) {
          this.onPagesChanged(this.state.pages);
        }
      });

      this.sequenceSwitcherElement.appendChild(btn);
    });

    // Button to start a new chapter
    const addChapterBtn = document.createElement('button');
    addChapterBtn.type = 'button';
    addChapterBtn.className = 'sequence-tab-btn btn-add-chapter-tab touch-btn';
    addChapterBtn.setAttribute('aria-label', 'Add next chapter to storybook');
    addChapterBtn.innerHTML = '➕ New Chapter';
    addChapterBtn.addEventListener('click', () => this.addChapter());
    this.sequenceSwitcherElement.appendChild(addChapterBtn);
  }

  clear() {
    this._resetTrashButtonUI();
    this.state.clear();
    this.render();
    this.setStatus('Entire current book deleted.', 'info');
    if (this.metricsElement) {
      this.metricsElement.innerHTML = '';
    }
    if (this.onPagesChanged) {
      this.onPagesChanged(this.state.pages);
    }
  }

  _bindTrashConfirmation() {
    if (!this.clearButton) return;
    let confirmTimer = null;

    this.clearButton.addEventListener('click', () => {
      if (this.state.isEmpty()) {
        this.setStatus('No pages in current book to delete.', 'info');
        return;
      }

      if (this.clearButton.classList.contains('confirming-delete')) {
        // Second confirmation tap: delete entire working book!
        if (confirmTimer) clearTimeout(confirmTimer);
        this.clearButton.classList.remove('confirming-delete');
        this._resetTrashButtonUI();
        this.clear();
        this.setStatus('🗑️ Entire current book deleted.', 'info');
      } else {
        // First tap: request confirmation
        this.clearButton.classList.add('confirming-delete');
        const label = this.clearButton.querySelector('.btn-4-label');
        const icon = this.clearButton.querySelector('.btn-4-icon');
        if (label) label.textContent = 'Sure?';
        if (icon) icon.textContent = '⚠️';
        this.setStatus('Tap Trash again to confirm deleting the entire book.', 'warning');

        confirmTimer = setTimeout(() => {
          this.clearButton.classList.remove('confirming-delete');
          this._resetTrashButtonUI();
        }, 3500);
      }
    });
  }

  _resetTrashButtonUI() {
    if (!this.clearButton) return;
    this.clearButton.classList.remove('confirming-delete');
    const label = this.clearButton.querySelector('.btn-4-label');
    const icon = this.clearButton.querySelector('.btn-4-icon');
    if (label) label.textContent = 'Trash';
    if (icon) icon.textContent = '🗑️';
  }

  getPages() {
    return this.state ? this.state.pages : [];
  }

  createFormData(fieldName = 'images') {
    return this.state ? this.state.createFormData(fieldName) : new FormData();
  }

  reset() {
    this.clear();
  }

  setAnalyzing(isAnalyzing) {
    if (this.analyzeButton) {
      this.analyzeButton.disabled = isAnalyzing || this.state.isEmpty();
      this.analyzeButton.setAttribute('aria-busy', isAnalyzing ? 'true' : 'false');
      const count = this.state.pages.length;
      const label = this.analyzeButton.querySelector('.btn-4-label');
      if (label) {
        label.textContent = isAnalyzing ? 'Reading...' : (count > 0 ? `Analyze (${count})` : 'Analyze');
      } else {
        this.analyzeButton.textContent = isAnalyzing ? '⏳ Analyzing Book...' : (count > 0 ? `🚀 Analyze Pages (${count})` : '🚀 Analyze Pages with Gemini');
      }
    }
    if (this.fileInput) this.fileInput.disabled = isAnalyzing;
    if (this.cameraInput) this.cameraInput.disabled = isAnalyzing;
    if (this.shutterButton) this.shutterButton.disabled = isAnalyzing;
    if (this.retakeButton) this.retakeButton.disabled = isAnalyzing;
  }

  setStatus(message, type = 'info') {
    if (!this.statusElement) return;
    this.statusElement.textContent = message;
    this.statusElement.className = `status-panel status-${type}`;
  }

  renderMetrics(metrics) {
    if (!this.metricsElement || !metrics) return;
    this.metricsElement.innerHTML = `
      <div class="metrics-card">
        <div class="metric-row"><span class="metric-label">Original:</span> <span class="metric-val">${metrics.originalWidth}×${metrics.originalHeight} (${metrics.originalSizeKB})</span></div>
        <div class="metric-row"><span class="metric-label">Compressed:</span> <span class="metric-val">${metrics.compressedWidth}×${metrics.compressedHeight} (${metrics.compressedSizeKB} KB)</span></div>
        <div class="metric-row"><span class="metric-label">Engine Speed:</span> <span class="metric-val">${metrics.durationMs} ms</span></div>
      </div>
    `;
  }

  renderLatestCard() {
    if (!this.latestCardElement) return;

    if (this.state.isEmpty()) {
      this.latestCardElement.innerHTML = `
        <div class="latest-card-empty">
          <span class="empty-icon">📖</span>
          <p class="empty-text">No pages captured yet.<br>Frame Page 1 in viewfinder and tap Snap 📷</p>
        </div>
      `;
      return;
    }

    const lastPage = this.state.pages[this.state.pages.length - 1];
    this.latestCardElement.innerHTML = `
      <div class="latest-card-content">
        <div class="latest-card-thumb-wrap">
          <img src="${lastPage.previewUrl || ''}" alt="Latest captured Page ${lastPage.pageNumber}" class="latest-thumb-img" />
          <span class="badge page-badge latest-page-badge">Page ${lastPage.pageNumber}</span>
        </div>
        <div class="latest-card-info">
          <div class="latest-card-title">Latest: Page ${lastPage.pageNumber}</div>
          <div class="latest-card-meta">${lastPage.width}×${lastPage.height} &bull; ${lastPage.metrics?.compressedSizeKB || ''} KB${lastPage.rotation ? ` &bull; ${lastPage.rotation}°` : ''}</div>
          <div class="latest-card-btn-group">
            <button type="button" class="touch-btn btn-auto-straighten-quick" id="btn-auto-straighten-latest" aria-label="Auto-straighten Page ${lastPage.pageNumber}">
              ✨ Auto-Straighten
            </button>
            <button type="button" class="touch-btn btn-rotate-quick" id="btn-rotate-latest" aria-label="Rotate Page ${lastPage.pageNumber} 90 degrees">
              🔄 Rotate
            </button>
            <button type="button" class="touch-btn btn-retake" id="btn-retake-latest" aria-label="Retake page ${lastPage.pageNumber}">
              ↩️ Retake
            </button>
          </div>
        </div>
      </div>
    `;

    const autoStraightenBtn = this.latestCardElement.querySelector('#btn-auto-straighten-latest');
    if (autoStraightenBtn) {
      autoStraightenBtn.addEventListener('click', () => {
        this.autoStraightenPage(lastPage.id);
      });
    }

    const rotateBtn = this.latestCardElement.querySelector('#btn-rotate-latest');
    if (rotateBtn) {
      rotateBtn.addEventListener('click', () => {
        this.rotateLastPage();
      });
    }

    const retakeBtn = this.latestCardElement.querySelector('#btn-retake-latest');
    if (retakeBtn) {
      retakeBtn.addEventListener('click', () => {
        this.retakeLastPage();
      });
    }
  }

  renderNextStepPrompt() {
    if (!this.nextStepPromptElement) return;

    if (this.state.isEmpty()) {
      this.nextStepPromptElement.textContent = 'Align Page 1 inside viewfinder & tap Snap 📷';
      this.nextStepPromptElement.className = 'next-step-prompt floating-prompt prompt-initial';
    } else if (this.state.isFull()) {
      this.nextStepPromptElement.textContent = `All ${this.state.maxPages} pages captured! Tap Analyze below 🚀`;
      this.nextStepPromptElement.className = 'next-step-prompt floating-prompt prompt-full';
    } else {
      const nextNum = this.state.pages.length + 1;
      this.nextStepPromptElement.textContent = `Page ${this.state.pages.length} Captured! Flip to Page ${nextNum} and tap Snap 📷`;
      this.nextStepPromptElement.className = 'next-step-prompt floating-prompt prompt-next';
    }
  }

  /**
   * Evaluates if a question is ready for the given page index and page object.
   * Checks delegate first, then falls back to internal lastAnalysisData.
   *
   * @param {number} index
   * @param {Object} page
   * @returns {boolean}
   */
  isQuestionReady(index, page) {
    if (typeof this.isQuestionReadyForPage === 'function') {
      try {
        const ready = this.isQuestionReadyForPage(index, page);
        if (ready) return true;
      } catch (_) {}
    }
    const data = this.lastAnalysisData;
    if (data && Array.isArray(data.chunks) && data.chunks.length > 0) {
      const pageNum = page?.pageNumber || (index + 1);
      const match = data.chunks.find((c) => {
        if (!c.page_range) return false;
        const digits = c.page_range.match(/(\d+)(?:\s*-\s*(\d+))?/);
        if (digits) {
          const s = parseInt(digits[1], 10);
          const e = digits[2] ? parseInt(digits[2], 10) : s;
          return pageNum >= s && pageNum <= e;
        }
        return false;
      }) || data.chunks.find((c) => c.chunk_id === pageNum) || data.chunks[Math.min(index, data.chunks.length - 1)];
      return Boolean(match && match.checkin_question && match.checkin_question.trim().length > 0);
    }
    return false;
  }

  /**
   * Updates question buttons in place (ungreys or greys them) across all rendered carousel slides.
   */
  updateQuestionButtonStates() {
    if (!this.carouselElement) return;
    const slides = this.carouselElement.querySelectorAll('.carousel-slide');
    slides.forEach((slide) => {
      const indexStr = slide.getAttribute('data-page-index');
      const pageId = slide.getAttribute('data-page-id');
      const index = parseInt(indexStr || '0', 10);
      const page = this.state.pages.find((p) => p.id === pageId) || this.state.pages[index];

      const isReady = this.isQuestionReady(index, page);
      const qBtn = slide.querySelector('.btn-question-slide');
      if (qBtn) {
        if (isReady) {
          qBtn.disabled = false;
          qBtn.removeAttribute('aria-disabled');
          qBtn.classList.remove('is-disabled');
          qBtn.classList.add('is-ready');
          qBtn.title = `Ask questions about Page ${page?.pageNumber || (index + 1)}`;
        } else {
          qBtn.disabled = true;
          qBtn.setAttribute('aria-disabled', 'true');
          qBtn.classList.add('is-disabled');
          qBtn.classList.remove('is-ready');
          qBtn.title = 'Analyze story to unlock questions';
        }
      }
    });
  }

  renderCarousel() {
    if (!this.carouselElement) return;

    const total = this.state.pages.length;

    if (total === 0) {
      this.carouselElement.innerHTML = `
        <div class="carousel-empty-placeholder">
          <span class="empty-icon">📖</span>
          <p class="empty-text">No book pages in sequence yet.<br>Snap photos to build your swipeable storybook!</p>
        </div>
      `;
      if (this.carouselDotsElement) {
        this.carouselDotsElement.innerHTML = '';
      }
      return;
    }

    this.carouselElement.innerHTML = '';

    this.state.pages.forEach((page, index) => {
      const hasQuestion = this.isQuestionReady(index, page);

      const slide = document.createElement('div');
      slide.className = 'carousel-slide';
      slide.id = `carousel-slide-${page.id}`;
      slide.setAttribute('data-page-id', page.id);
      slide.setAttribute('data-page-index', index);

      slide.innerHTML = `
        <div class="carousel-slide-header">
          <span class="badge page-badge">Page ${page.pageNumber} of ${total}</span>
          ${page.isSidewaysDetected ? '<span class="badge badge-sideways-alert">⚠️ Sideways Detected</span>' : ''}
          <span class="carousel-slide-meta">${page.width}×${page.height}${page.rotation ? ` &bull; ${page.rotation}°` : ''}</span>
        </div>
        <div class="carousel-img-wrap">
          <img src="${page.previewUrl || ''}" alt="Book Page ${page.pageNumber} of ${total}" class="carousel-img" />
        </div>
        <div class="carousel-slide-actions carousel-3actions">
          <button type="button" class="touch-btn action-icon-btn btn-retake-slide" data-action="retake" data-id="${page.id}" aria-label="Retake Page ${page.pageNumber}" title="Retake Page">
            ↩️ Retake
          </button>
          <button type="button" class="touch-btn action-icon-btn btn-rotate-slide" data-action="rotate" data-id="${page.id}" aria-label="Rotate Page ${page.pageNumber} 90 degrees" title="Rotate 90°">
            🔄 Rotate
          </button>
          <button type="button" class="touch-btn action-icon-btn btn-question-slide ${hasQuestion ? 'is-ready' : 'is-disabled'}" data-action="question" data-id="${page.id}" data-page-index="${index}" aria-label="Ask questions about Page ${page.pageNumber}" title="${hasQuestion ? 'Ask questions about this page' : 'Analyze story to unlock questions'}" ${hasQuestion ? '' : 'disabled aria-disabled="true"'}>
            ❓ Question
          </button>
        </div>
        <div class="slide-question-card" id="slide-question-card-${page.id}" style="display: none;">
          <div class="slide-q-header">
            <span class="slide-q-status" id="slide-q-status-${page.id}">🔊 Speaking...</span>
          </div>
          <p class="slide-q-text" id="slide-q-text-${page.id}"></p>
          <div class="slide-q-listen-area">
            <button type="button" class="touch-btn btn-slide-ptt" id="btn-slide-ptt-${page.id}" aria-label="Microphone answer button">
              <span class="slide-ptt-pulse-ring" aria-hidden="true"></span>
              <span class="slide-ptt-icon" aria-hidden="true">🎙️</span>
              <span class="slide-ptt-label">Listening...</span>
            </button>
          </div>
          <div class="slide-q-transcript" id="slide-q-transcript-${page.id}" style="display: none;">
            <span class="transcript-prefix">🗣️ </span>
            <span class="transcript-content" id="slide-transcript-text-${page.id}">Listening... Speak your answer!</span>
          </div>
          <div class="slide-q-feedback" id="slide-q-feedback-${page.id}" style="display: none;"></div>
        </div>
      `;

      const retakeBtn = slide.querySelector('.btn-retake-slide');
      if (retakeBtn) {
        retakeBtn.addEventListener('click', () => {
          this.state.removePage(page.id);
          this.render();
          if (this.onPagesChanged) this.onPagesChanged(this.state.pages);
          this.setStatus(`Retook Page ${page.pageNumber}. Ready for new capture.`, 'info');
        });
      }

      const rotateBtn = slide.querySelector('.btn-rotate-slide');
      if (rotateBtn) {
        rotateBtn.addEventListener('click', async () => {
          rotateBtn.disabled = true;
          try {
            await this.rotatePage(page.id, 90);
          } finally {
            rotateBtn.disabled = false;
          }
        });
      }

      const questionBtn = slide.querySelector('.btn-question-slide');
      if (questionBtn) {
        let lastTriggerTime = 0;
        const triggerQuestion = (e) => {
          const isReadyNow = this.isQuestionReady(index, page);
          if (!isReadyNow) {
            this.setStatus('Tap Analyze first to unlock questions for this page!', 'info');
            return;
          }
          const now = Date.now();
          if (now - lastTriggerTime < 500) return;
          lastTriggerTime = now;

          this.activePageIndex = index;

          // Unlock audio context immediately on touch/click gesture
          if (typeof window !== 'undefined') {
            if (window.__audioManager && !window.__audioManager.isUnlocked) {
              window.__audioManager.unlock().catch(() => {});
            }
            if (window.__storyReaderApp) {
              if (!window.__storyReaderApp.bookData && this.lastAnalysisData) {
                window.__storyReaderApp.setBookData(this.lastAnalysisData);
              }
              if (typeof window.__storyReaderApp.askQuestionsAboutPage === 'function') {
                window.__storyReaderApp.askQuestionsAboutPage(index, page);
                return;
              }
            }
          }

          if (typeof this.onAskPageQuestion === 'function') {
            this.onAskPageQuestion(page, index);
          }
        };

        questionBtn.addEventListener('click', triggerQuestion);
      }

      this.carouselElement.appendChild(slide);
    });

    if (this.carouselDotsElement) {
      this.carouselDotsElement.innerHTML = '';
      this.state.pages.forEach((page, index) => {
        const chip = document.createElement('button');
        chip.type = 'button';
        chip.className = `carousel-dot-chip${index === 0 ? ' active' : ''}`;
        chip.setAttribute('aria-label', `Jump to Page ${page.pageNumber}`);
        chip.textContent = `Page ${page.pageNumber}`;
        chip.addEventListener('click', () => {
          this.scrollToPageIndex(index);
        });
        this.carouselDotsElement.appendChild(chip);
      });
    }
    this._bindCarouselScroll();
  }

  /**
   * Smoothly scrolls the horizontal carousel to target page index.
   * @param {number} index
   */
  scrollToPageIndex(index) {
    if (!this.carouselElement) return;
    const total = this.state.pages.length;
    if (index < 0 || index >= total) return;
    this.activePageIndex = index;
    const targetSlide = this.carouselElement.querySelector(`[data-page-index="${index}"]`);
    if (targetSlide) {
      targetSlide.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
    }
    if (this.carouselDotsElement) {
      this.carouselDotsElement.querySelectorAll('.carousel-dot-chip').forEach((c, i) => {
        c.classList.toggle('active', i === index);
      });
    }
    if (typeof this.onActivePageChange === 'function') {
      this.onActivePageChange(index, this.state.pages[index]);
    }
  }

  /**
   * Binds scroll-snap tracking so swiping carousel manually updates active page.
   * @private
   */
  _bindCarouselScroll() {
    if (!this.carouselElement || this._carouselScrollBound) return;
    this._carouselScrollBound = true;
    let scrollTimer = null;
    this.carouselElement.addEventListener('scroll', () => {
      clearTimeout(scrollTimer);
      scrollTimer = setTimeout(() => {
        const scrollLeft = this.carouselElement.scrollLeft;
        const slideWidth = this.carouselElement.clientWidth || 320;
        const total = this.state.pages.length;
        if (total === 0) return;
        const newIndex = Math.min(Math.max(0, Math.round(scrollLeft / slideWidth)), total - 1);
        if (newIndex !== this.activePageIndex) {
          this.activePageIndex = newIndex;
          if (this.carouselDotsElement) {
            this.carouselDotsElement.querySelectorAll('.carousel-dot-chip').forEach((c, i) => {
              c.classList.toggle('active', i === newIndex);
            });
          }
          if (typeof this.onActivePageChange === 'function') {
            this.onActivePageChange(newIndex, this.state.pages[newIndex]);
          }
        }
      }, 150);
    }, { passive: true });
  }

  /**
   * Auto-swipes to the next page on the right.
   * @param {number} [currentIndex]
   * @returns {number|null} Next page index or null if at end of sequence
   */
  swipeToNextPage(currentIndex) {
    const fromIdx = (currentIndex !== undefined && currentIndex !== null) ? currentIndex : (this.activePageIndex || 0);
    const nextIdx = fromIdx + 1;
    if (nextIdx < this.state.pages.length) {
      this.scrollToPageIndex(nextIdx);
      return nextIdx;
    }
    return null;
  }

  /**
   * Renders drawer control elements: thumbnail pill, review button, and drawer count badge.
   */
  renderDrawerControls() {
    const totalInSeq = this.state.pages.length;
    const totalAll = this.state.getTotalPageCount();
    const seqCount = this.state.getSequenceCount();

    if (this.openReviewButton) {
      this.openReviewButton.setAttribute('aria-label', `Review current snapped book and questions (${totalAll} captured)`);
      if (!this.openReviewButton.classList.contains('nav-icon-btn')) {
        this.openReviewButton.textContent = `📖 Review Book (${totalAll})`;
      }
    }

    if (this.drawerCountBadge) {
      const chCount = this.state.getSequenceCount();
      if (totalAll === 0) {
        this.drawerCountBadge.textContent = '0';
      } else if (chCount > 1) {
        this.drawerCountBadge.textContent = `${chCount} Ch`;
      } else {
        this.drawerCountBadge.textContent = `Ch 1`;
      }
      this.drawerCountBadge.setAttribute('aria-label', `${chCount} chapter${chCount === 1 ? '' : 's'}, ${totalAll} total pages`);
    }

    if (this.scanChapterLabel) {
      const chIdx = this.state.currentSequenceIndex + 1;
      const chPages = this.state.pages.length;
      this.scanChapterLabel.textContent = `📖 Chapter ${chIdx} (${chPages} Page${chPages === 1 ? '' : 's'})`;
    }

    if (this.latestPreviewPill) {
      if (totalAll === 0) {
        this.latestPreviewPill.innerHTML = `
          <div class="pill-thumb-wrap">
            <span class="pill-placeholder">📖</span>
          </div>
          <span class="badge pill-badge" id="pill-count-badge">0</span>
        `;
        this.latestPreviewPill.setAttribute('aria-label', 'Review book pages (0 captured)');
      } else {
        const lastPage = this.state.pages[totalInSeq - 1] || this.state.sequences[0]?.[0];
        this.latestPreviewPill.innerHTML = `
          <div class="pill-thumb-wrap">
            <img src="${lastPage?.previewUrl || ''}" alt="Page ${lastPage?.pageNumber || ''}" class="pill-thumb-img" />
          </div>
          <span class="badge pill-badge" id="pill-count-badge">${totalAll}</span>
        `;
        this.latestPreviewPill.setAttribute('aria-label', `Review book pages (${totalAll} captured, active: Page ${lastPage?.pageNumber || ''})`);
      }
    }
  }

  render() {
    const totalInSeq = this.state.pages.length;
    const totalAll = this.state.getTotalPageCount();

    if (this.analyzeButton) {
      this.analyzeButton.disabled = this.state.isEmpty();
      const isBusy = this.analyzeButton.getAttribute('aria-busy') === 'true';
      if (!isBusy) {
        const label = this.analyzeButton.querySelector('.btn-4-label');
        if (label) {
          label.textContent = totalAll > 0 ? `Analyze (${totalAll})` : 'Analyze';
        } else {
          this.analyzeButton.textContent = totalAll > 0 ? `🚀 Analyze Pages (${totalAll})` : '🚀 Analyze Pages with Gemini';
        }
      }
    }

    if (this.retakeButton) {
      this.retakeButton.disabled = this.state.isEmpty();
    }

    if (this.rotateViewfinderButton) {
      this.rotateViewfinderButton.disabled = this.state.isEmpty();
    }

    this._updateAutoStraightenButton();

    this.renderSequenceSwitcher();
    this.renderNextStepPrompt();
    this.renderLatestCard();
    this.renderCarousel();
    this.renderDrawerControls();

    if (!this.trayElement) return;

    if (this.state.isEmpty()) {
      this.trayElement.innerHTML = `
        <div class="tray-empty-placeholder">
          <p>📷 No pages captured yet.<br>Snap photos with camera or browse photo library.</p>
        </div>
      `;
      return;
    }

    this.trayElement.innerHTML = '';

    this.state.pages.forEach((page, index) => {
      const item = document.createElement('div');
      item.className = 'tray-page-card';
      item.setAttribute('data-page-id', page.id);
      item.setAttribute('data-page-number', page.pageNumber);

      const isFirst = index === 0;
      const isLast = index === totalInSeq - 1;

      item.innerHTML = `
        <div class="card-header">
          <span class="badge page-badge">Page ${page.pageNumber}</span>
          <span class="page-meta">${page.width}×${page.height}</span>
        </div>
        <div class="card-thumbnail">
          <img src="${page.previewUrl || ''}" alt="Page ${page.pageNumber} thumbnail" class="thumb-img" />
        </div>
        <div class="card-actions">
          <button type="button" class="touch-btn action-icon-btn btn-auto-straighten-tray" data-action="auto-straighten" data-id="${page.id}" aria-label="Auto-straighten page ${page.pageNumber}" title="Auto-Straighten">
            ✨
          </button>
          <button type="button" class="touch-btn action-icon-btn btn-rotate-tray" data-action="rotate" data-id="${page.id}" aria-label="Rotate page ${page.pageNumber}" title="Rotate 90°">
            🔄
          </button>
          <button type="button" class="touch-btn action-icon-btn btn-reorder-left" data-action="left" data-index="${index}" ${isFirst ? 'disabled' : ''} aria-label="Move page ${page.pageNumber} earlier" title="Move earlier">
            ◀
          </button>
          <button type="button" class="touch-btn action-icon-btn btn-delete" data-action="delete" data-id="${page.id}" aria-label="Delete page ${page.pageNumber}" title="Delete page">
            🗑️
          </button>
          <button type="button" class="touch-btn action-icon-btn btn-reorder-right" data-action="right" data-index="${index}" ${isLast ? 'disabled' : ''} aria-label="Move page ${page.pageNumber} later" title="Move later">
            ▶
          </button>
        </div>
      `;

      const autoStraightenBtn = item.querySelector('.btn-auto-straighten-tray');
      if (autoStraightenBtn) {
        autoStraightenBtn.addEventListener('click', () => {
          this.autoStraightenPage(page.id);
        });
      }

      const rotateBtn = item.querySelector('.btn-rotate-tray');
      if (rotateBtn) {
        rotateBtn.addEventListener('click', () => {
          this.rotatePage(page.id, 90);
        });
      }

      const leftBtn = item.querySelector('.btn-reorder-left');
      if (leftBtn && !isFirst) {
        leftBtn.addEventListener('click', () => {
          this.state.reorderPages(index, index - 1);
          this.render();
          if (this.onPagesChanged) this.onPagesChanged(this.state.pages);
        });
      }

      const rightBtn = item.querySelector('.btn-reorder-right');
      if (rightBtn && !isLast) {
        rightBtn.addEventListener('click', () => {
          this.state.reorderPages(index, index + 1);
          this.render();
          if (this.onPagesChanged) this.onPagesChanged(this.state.pages);
        });
      }

      const deleteBtn = item.querySelector('.btn-delete');
      if (deleteBtn) {
        deleteBtn.addEventListener('click', () => {
          this.state.removePage(page.id);
          this.render();
          if (this.onPagesChanged) this.onPagesChanged(this.state.pages);
        });
      }

      this.trayElement.appendChild(item);
    });
  }
}
