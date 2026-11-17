import test from 'node:test';
import assert from 'node:assert/strict';
import {
  detectTextOrientationFromGrayscale,
} from '../public/js/orientation_detector.js';
import {
  executeBookAnalysisWithFallback,
} from '../services/gemini_service.js';

test('detectTextOrientationFromGrayscale applies illustration guard in portrait orientation', () => {
  const width = 60;
  const height = 80;

  // Portrait image with subtle vertical contrast that should NOT trigger false positive
  const subtleVerticalData = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      // Gentle gradient variation that produces a ratio between 1.05 and 1.25
      subtleVerticalData[y * width + x] = 120 + ((x % 6) < 3 ? 15 : 0);
    }
  }

  const result = detectTextOrientationFromGrayscale(subtleVerticalData, width, height);
  assert.equal(
    result.recommendedRotation,
    0,
    'Subtle vertical gradient in portrait orientation should be guarded against false-positive rotation'
  );
  assert.equal(result.isSideways, false);
});

test('detectTextOrientationFromGrayscale triggers sideways rotation when ratio > 1.35', () => {
  const width = 60;
  const height = 80;

  // High contrast vertical stripes simulating 90-degree sideways text
  const strongVerticalData = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      strongVerticalData[y * width + x] = (x % 8) < 3 ? 10 : 240;
    }
  }

  const result = detectTextOrientationFromGrayscale(strongVerticalData, width, height);
  assert.equal(result.recommendedRotation, 90);
  assert.equal(result.isSideways, true);
});

test('executeBookAnalysisWithFallback switches to fallback model on 503 high demand', async () => {
  let callCount = 0;
  const modelsCalled = [];

  const mockApiFn = async (modelName) => {
    callCount++;
    modelsCalled.push(modelName);

    if (modelName === 'gemini-3.1-flash-lite') {
      const err = new Error('This model is currently experiencing high demand. (503)');
      err.status = 503;
      throw err;
    }

    return {
      text: JSON.stringify({
        is_legible: true,
        book_type: 'fiction',
        summary: 'Fallback success summary',
        chunks: [],
      }),
      candidates: [{ finishReason: 'STOP', content: { parts: [{ text: 'ok' }] } }],
    };
  };

  const result = await executeBookAnalysisWithFallback(mockApiFn, {
    primaryModel: 'gemini-3.1-flash-lite',
    fallbackModel: 'gemini-2.5-flash',
  });

  assert.equal(callCount, 2);
  assert.deepEqual(modelsCalled, ['gemini-3.1-flash-lite', 'gemini-2.5-flash']);
  assert.equal(result.summary, 'Fallback success summary');
});

test('executeBookAnalysisWithFallback does not call fallback model on primary success', async () => {
  let callCount = 0;
  const modelsCalled = [];

  const mockApiFn = async (modelName) => {
    callCount++;
    modelsCalled.push(modelName);
    return {
      text: JSON.stringify({
        is_legible: true,
        book_type: 'fiction',
        summary: 'Primary success summary',
        chunks: [],
      }),
      candidates: [{ finishReason: 'STOP', content: { parts: [{ text: 'ok' }] } }],
    };
  };

  const result = await executeBookAnalysisWithFallback(mockApiFn, {
    primaryModel: 'gemini-3.1-flash-lite',
    fallbackModel: 'gemini-2.5-flash',
  });

  assert.equal(callCount, 1);
  assert.deepEqual(modelsCalled, ['gemini-3.1-flash-lite']);
  assert.equal(result.summary, 'Primary success summary');
});
