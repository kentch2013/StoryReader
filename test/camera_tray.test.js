import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateDownscaleDimensions,
  CameraTrayState,
  compressImageToBlob,
  createPageRecord,
  rotateImageBlob,
} from '../public/js/camera_tray.js';

test('calculateDownscaleDimensions preserves dimensions already within boundary', () => {
  const result = calculateDownscaleDimensions(1024, 768, 1600);
  assert.equal(result.width, 1024);
  assert.equal(result.height, 768);
  assert.equal(result.scale, 1);
});

test('calculateDownscaleDimensions scales down landscape 12MP image to <= 1600px', () => {
  // iPhone 14 Plus default 12MP landscape photo: 4032 x 3024
  const result = calculateDownscaleDimensions(4032, 3024, 1600);
  assert.equal(result.width, 1600);
  assert.equal(result.height, 1200);
  assert.ok(result.scale < 0.40 && result.scale > 0.39);
});

test('calculateDownscaleDimensions scales down portrait 12MP image to <= 1600px', () => {
  // iPhone 14 Plus default 12MP portrait photo: 3024 x 4032
  const result = calculateDownscaleDimensions(3024, 4032, 1600);
  assert.equal(result.width, 1200);
  assert.equal(result.height, 1600);
  assert.ok(result.scale < 0.40 && result.scale > 0.39);
});

test('calculateDownscaleDimensions throws on non-positive or invalid input', () => {
  assert.throws(() => calculateDownscaleDimensions(0, 500), /invalid dimensions/i);
  assert.throws(() => calculateDownscaleDimensions(-100, 200), /invalid dimensions/i);
  assert.throws(() => calculateDownscaleDimensions('wide', 200), /invalid dimensions/i);
});

test('CameraTrayState initializes empty and tracks pages accurately', () => {
  const tray = new CameraTrayState({ maxPages: 20 });
  assert.equal(tray.pages.length, 0);
  assert.equal(tray.isEmpty(), true);
  assert.equal(tray.isFull(), false);
});

test('CameraTrayState.addPage adds pages and sets contiguous 1-based pageNumbers', () => {
  const tray = new CameraTrayState({ maxPages: 20 });

  const dummyBlob1 = new Blob(['page-one-content'], { type: 'image/jpeg' });
  const dummyBlob2 = new Blob(['page-two-content'], { type: 'image/jpeg' });

  const p1 = tray.addPage({ blob: dummyBlob1, width: 1600, height: 1200, originalName: 'scan1.jpg' });
  assert.equal(p1.pageNumber, 1);
  assert.equal(tray.pages.length, 1);
  assert.ok(p1.id.startsWith('page_'));

  const p2 = tray.addPage({ blob: dummyBlob2, width: 1600, height: 1200, originalName: 'scan2.jpg' });
  assert.equal(p2.pageNumber, 2);
  assert.equal(tray.pages.length, 2);
});

test('CameraTrayState.addPage enforces maxPages ceiling of 20', () => {
  const tray = new CameraTrayState({ maxPages: 3 });
  for (let i = 1; i <= 3; i++) {
    tray.addPage({ blob: new Blob([`content-${i}`], { type: 'image/jpeg' }) });
  }
  assert.equal(tray.isFull(), true);
  assert.throws(() => {
    tray.addPage({ blob: new Blob(['overflow'], { type: 'image/jpeg' }) });
  }, /maximum.*page.*exceeded/i);
});

test('CameraTrayState.removePage deletes page and re-indexes remaining page numbers', () => {
  const tray = new CameraTrayState({ maxPages: 20 });
  const p1 = tray.addPage({ blob: new Blob(['p1'], { type: 'image/jpeg' }) });
  const p2 = tray.addPage({ blob: new Blob(['p2'], { type: 'image/jpeg' }) });
  const p3 = tray.addPage({ blob: new Blob(['p3'], { type: 'image/jpeg' }) });

  assert.equal(tray.pages.length, 3);
  assert.equal(p2.pageNumber, 2);

  // Remove middle page (Page 2)
  const removed = tray.removePage(p2.id);
  assert.equal(removed, true);
  assert.equal(tray.pages.length, 2);

  // Check that remaining pages are re-indexed to 1 and 2
  assert.equal(tray.pages[0].id, p1.id);
  assert.equal(tray.pages[0].pageNumber, 1);
  assert.equal(tray.pages[1].id, p3.id);
  assert.equal(tray.pages[1].pageNumber, 2);
});

test('CameraTrayState.reorderPages swaps page order and re-indexes page numbers', () => {
  const tray = new CameraTrayState({ maxPages: 20 });
  const p1 = tray.addPage({ blob: new Blob(['p1'], { type: 'image/jpeg' }) });
  const p2 = tray.addPage({ blob: new Blob(['p2'], { type: 'image/jpeg' }) });
  const p3 = tray.addPage({ blob: new Blob(['p3'], { type: 'image/jpeg' }) });

  // Move page 3 to position 0 (first)
  tray.reorderPages(2, 0);

  assert.equal(tray.pages[0].id, p3.id);
  assert.equal(tray.pages[0].pageNumber, 1);
  assert.equal(tray.pages[1].id, p1.id);
  assert.equal(tray.pages[1].pageNumber, 2);
  assert.equal(tray.pages[2].id, p2.id);
  assert.equal(tray.pages[2].pageNumber, 3);
});

test('CameraTrayState.createFormData builds multipart payload under images field', () => {
  const tray = new CameraTrayState({ maxPages: 20 });

  // Empty tray throws error
  assert.throws(() => tray.createFormData(), /empty tray/i);

  tray.addPage({ blob: new Blob(['image-bytes-1'], { type: 'image/jpeg' }) });
  tray.addPage({ blob: new Blob(['image-bytes-2'], { type: 'image/jpeg' }) });

  const formData = tray.createFormData('images');
  assert.ok(formData instanceof FormData);
  const files = formData.getAll('images');
  assert.equal(files.length, 2);
  assert.equal(files[0].name, 'page_1.jpg');
  assert.equal(files[1].name, 'page_2.jpg');
});

test('compressImageToBlob compresses image to <= 300KB using canvas factory', async () => {
  // Mock canvas and context to simulate in-browser downscaling without browser binaries
  let drawnWidth = 0;
  let drawnHeight = 0;
  const mockContext = {
    drawImage: (img, sx, sy, sw, sh, dx, dy, dw, dh) => {
      // Record drawing target dimensions
      drawnWidth = dw || img.width;
      drawnHeight = dh || img.height;
    },
    imageSmoothingEnabled: false,
    imageSmoothingQuality: 'low',
  };

  const mockCanvas = {
    width: 0,
    height: 0,
    getContext: (type) => (type === '2d' ? mockContext : null),
    toBlob: (callback, mimeType, quality) => {
      // Simulate compressed JPEG blob (e.g. 240KB)
      const compressedBytes = new Uint8Array(240 * 1024);
      const blob = new Blob([compressedBytes], { type: mimeType });
      callback(blob);
    },
  };

  const mockCanvasFactory = () => mockCanvas;

  const mockSourceImage = {
    width: 4032,
    height: 3024,
  };

  const blob = await compressImageToBlob(mockSourceImage, {
    maxDimension: 1600,
    quality: 0.8,
    canvasFactory: mockCanvasFactory,
  });

  assert.ok(blob instanceof Blob);
  assert.equal(blob.type, 'image/jpeg');
  assert.ok(blob.size <= 300 * 1024, `Expected blob size <= 300KB, got ${blob.size / 1024}KB`);
  assert.equal(mockCanvas.width, 1600);
  assert.equal(mockCanvas.height, 1200);
});

test('CameraTrayState.retakeLastPage removes and returns the most recently captured page', () => {
  const tray = new CameraTrayState({ maxPages: 20 });
  assert.equal(tray.retakeLastPage(), null);

  const p1 = tray.addPage({ blob: new Blob(['p1'], { type: 'image/jpeg' }) });
  const p2 = tray.addPage({ blob: new Blob(['p2'], { type: 'image/jpeg' }) });

  assert.equal(tray.pages.length, 2);
  const retaken = tray.retakeLastPage();
  assert.equal(retaken.id, p2.id);
  assert.equal(tray.pages.length, 1);
  assert.equal(tray.pages[0].id, p1.id);
  assert.equal(tray.pages[0].pageNumber, 1);

  // New page added after retake takes slot 2
  const p2New = tray.addPage({ blob: new Blob(['p2-retake'], { type: 'image/jpeg' }) });
  assert.equal(p2New.pageNumber, 2);
  assert.equal(tray.pages.length, 2);
});

test('compressImageToBlob downscales video element sources (videoWidth / videoHeight)', async () => {
  const mockContext = {
    drawImage: () => {},
    imageSmoothingEnabled: false,
    imageSmoothingQuality: 'low',
  };

  const mockCanvas = {
    width: 0,
    height: 0,
    getContext: (type) => (type === '2d' ? mockContext : null),
    toBlob: (callback, mimeType) => {
      callback(new Blob([new Uint8Array(180 * 1024)], { type: mimeType }));
    },
  };

  const mockVideoSource = {
    videoWidth: 1920,
    videoHeight: 1080,
  };

  const blob = await compressImageToBlob(mockVideoSource, {
    maxDimension: 1600,
    quality: 0.8,
    canvasFactory: () => mockCanvas,
  });

  assert.ok(blob instanceof Blob);
  assert.equal(mockCanvas.width, 1600);
  assert.equal(mockCanvas.height, 900);
});

test('CameraTrayState.rotatePage rotates page by 90 degrees and updates rotation state', () => {
  const tray = new CameraTrayState({ maxPages: 20 });
  const p1 = tray.addPage({ blob: new Blob(['p1'], { type: 'image/jpeg' }), width: 1600, height: 1200 });

  assert.equal(p1.rotation || 0, 0);

  // Rotate 90 degrees clockwise
  const rotated1 = tray.rotatePage(p1.id, 90);
  assert.equal(rotated1.rotation, 90);
  assert.equal(rotated1.width, 1200);
  assert.equal(rotated1.height, 1600);

  // Rotate another 90 degrees (180 total)
  const rotated2 = tray.rotatePage(p1.id, 90);
  assert.equal(rotated2.rotation, 180);
  assert.equal(rotated2.width, 1600);
  assert.equal(rotated2.height, 1200);

  // Non-existent page returns null
  assert.equal(tray.rotatePage('non-existent-id'), null);
});

test('rotateImageBlob creates rotated canvas and returns rotated JPEG blob', async () => {
  let rotatedAngle = 0;
  let translatedX = 0;
  let translatedY = 0;

  const mockContext = {
    translate: (x, y) => { translatedX = x; translatedY = y; },
    rotate: (angle) => { rotatedAngle = angle; },
    drawImage: () => {},
    imageSmoothingEnabled: false,
    imageSmoothingQuality: 'low',
  };

  const mockCanvas = {
    width: 0,
    height: 0,
    getContext: (type) => (type === '2d' ? mockContext : null),
    toBlob: (callback, mimeType) => {
      callback(new Blob([new Uint8Array(200 * 1024)], { type: mimeType }));
    },
  };

  const mockImage = {
    width: 1600,
    height: 1200,
  };

  const rotatedBlob = await rotateImageBlob(mockImage, 90, {
    canvasFactory: () => mockCanvas,
  });

  assert.ok(rotatedBlob instanceof Blob);
  // Dimensions should swap for 90 degree rotation
  assert.equal(mockCanvas.width, 1200);
  assert.equal(mockCanvas.height, 1600);
  assert.equal(translatedX, 1200);
  assert.equal(translatedY, 0);
  assert.equal(rotatedAngle, Math.PI / 2);
});

test('CameraTrayState.startNewSequence archives active sequence and begins next sequence', () => {
  const tray = new CameraTrayState({ maxPages: 20 });
  tray.addPage({ blob: new Blob(['p1'], { type: 'image/jpeg' }) });
  tray.addPage({ blob: new Blob(['p2'], { type: 'image/jpeg' }) });

  assert.equal(tray.pages.length, 2);
  assert.equal(tray.getSequenceCount(), 1);

  const newSeqIndex = tray.startNewSequence();
  assert.equal(newSeqIndex, 1);
  assert.equal(tray.pages.length, 0);
  assert.equal(tray.getSequenceCount(), 2);
  assert.equal(tray.getTotalPageCount(), 2);

  const p3 = tray.addPage({ blob: new Blob(['p3'], { type: 'image/jpeg' }) });
  assert.equal(p3.pageNumber, 1);
  assert.equal(p3.sequenceNumber, 2);
  assert.equal(tray.pages.length, 1);
  assert.equal(tray.getTotalPageCount(), 3);
});

test('CameraTrayState auto-starts new sequence when maxPages is exceeded with autoSequence option', () => {
  const tray = new CameraTrayState({ maxPages: 2, autoSequence: true });
  tray.addPage({ blob: new Blob(['p1'], { type: 'image/jpeg' }) });
  tray.addPage({ blob: new Blob(['p2'], { type: 'image/jpeg' }) });

  assert.equal(tray.pages.length, 2);
  assert.equal(tray.currentSequenceIndex, 0);

  const p3 = tray.addPage({ blob: new Blob(['p3'], { type: 'image/jpeg' }) });
  assert.equal(tray.currentSequenceIndex, 1);
  assert.equal(p3.sequenceNumber, 2);
  assert.equal(p3.pageNumber, 1);
  assert.equal(tray.pages.length, 1);
  assert.equal(tray.getTotalPageCount(), 3);
});



