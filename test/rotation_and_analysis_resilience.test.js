import test from 'node:test';
import assert from 'node:assert/strict';
import {
  detectDeviceRotation,
  detectTextOrientationFromGrayscale,
} from '../public/js/orientation_detector.js';
import {
  analyzeBookPages,
  classifyModelResponse,
} from '../services/gemini_service.js';

test('detectDeviceRotation extracts angle from screen.orientation or window.orientation', () => {
  assert.equal(detectDeviceRotation({ screen: { orientation: { angle: 90 } } }), 90);
  assert.equal(detectDeviceRotation({ screen: { orientation: { angle: 270 } } }), 270);
  assert.equal(detectDeviceRotation({ orientation: 90 }), 90);
  assert.equal(detectDeviceRotation({ orientation: -90 }), 270);
  assert.equal(detectDeviceRotation({}), 0);
  assert.equal(detectDeviceRotation(null), 0);
});

test('detectTextOrientationFromGrayscale identifies horizontal vs vertical text line patterns without AI', () => {
  const width = 60;
  const height = 60;

  // 1. Horizontal stripes simulating upright text lines with blank margins
  const horizontalData = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    const isTextLine = (y % 8) < 3; // 3 pixels of text, 5 pixels of blank gutter
    for (let x = 0; x < width; x++) {
      horizontalData[y * width + x] = isTextLine ? 20 : 240;
    }
  }

  const horizResult = detectTextOrientationFromGrayscale(horizontalData, width, height);
  assert.equal(horizResult.recommendedRotation, 0, 'Horizontal text lines should not be rotated');
  assert.equal(horizResult.isSideways, false);

  // 2. Vertical stripes simulating 90-degree sideways text lines
  const verticalData = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const isTextCol = (x % 8) < 3;
      verticalData[y * width + x] = isTextCol ? 20 : 240;
    }
  }

  const vertResult = detectTextOrientationFromGrayscale(verticalData, width, height);
  assert.equal(vertResult.recommendedRotation, 90, 'Vertical text lines should recommend 90 degree rotation');
  assert.equal(vertResult.isSideways, true);
});

test('classifyModelResponse detects SAFETY blocks and returns actionable diagnostic', () => {
  const mockSafetyResponse = {
    text: undefined,
    candidates: [
      {
        finishReason: 'SAFETY',
        content: { parts: [] },
      },
    ],
  };

  const outcome = classifyModelResponse(mockSafetyResponse);
  assert.equal(outcome.status, 'error');
  assert.equal(outcome.code, 'SAFETY_BLOCKED');
  assert.match(outcome.message, /safety/i);
});

test('classifyModelResponse detects RECITATION blocks and returns actionable diagnostic', () => {
  const mockRecitationResponse = {
    text: undefined,
    candidates: [
      {
        finishReason: 'RECITATION',
        content: { parts: [] },
      },
    ],
  };

  const outcome = classifyModelResponse(mockRecitationResponse);
  assert.equal(outcome.status, 'error');
  assert.equal(outcome.code, 'RECITATION_BLOCKED');
  assert.match(outcome.message, /recitation/i);
});

test('classifyModelResponse detects empty text as transient retryable model dropout', () => {
  const mockEmptyResponse = {
    text: '',
    candidates: [
      {
        finishReason: 'STOP',
        content: { parts: [] },
      },
    ],
  };

  const outcome = classifyModelResponse(mockEmptyResponse);
  assert.equal(outcome.status, 'retryable');
  assert.equal(outcome.retryableStatus, 503);
  assert.match(outcome.message, /empty response text/i);
});
