import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BOOK_ANALYSIS_SCHEMA,
  BOOK_ANALYSIS_SYSTEM_PROMPT,
  BOOK_ANALYSIS_DIRECT_SYSTEM_PROMPT,
} from '../prompts/book_analysis.js';
import { getMockBookAnalysis } from '../services/gemini_service.js';

test('D-CROWD: BOOK_ANALYSIS_SCHEMA defines 5 deterministic CROWD question types', () => {
  const questionTypeProperty = BOOK_ANALYSIS_SCHEMA.properties.chunks.items.properties.question_type;
  assert.ok(questionTypeProperty, 'question_type property must exist in chunk schema');
  assert.ok(Array.isArray(questionTypeProperty.enum), 'question_type must have an enum array');

  const requiredDCrowdTypes = [
    'completion_cloze',
    'sequential_recall',
    'observable_visual',
    'wh_causality',
    'distancing_schema',
  ];

  for (const expectedType of requiredDCrowdTypes) {
    assert.ok(
      questionTypeProperty.enum.includes(expectedType),
      `question_type enum must include deterministic CROWD type "${expectedType}"`
    );
  }
});

test('D-CROWD: System prompts define the deterministic CROWD dialogic reading framework', () => {
  const prompts = [
    { name: 'BOOK_ANALYSIS_SYSTEM_PROMPT', text: BOOK_ANALYSIS_SYSTEM_PROMPT },
    { name: 'BOOK_ANALYSIS_DIRECT_SYSTEM_PROMPT', text: BOOK_ANALYSIS_DIRECT_SYSTEM_PROMPT },
  ];

  const requiredTerms = [
    'completion_cloze',
    'sequential_recall',
    'observable_visual',
    'wh_causality',
    'distancing_schema',
  ];

  for (const { name, text } of prompts) {
    for (const term of requiredTerms) {
      assert.ok(
        text.includes(term),
        `${name} must specify D-CROWD question type: ${term}`
      );
    }

    // Must mandate chunk variety rotation
    assert.match(
      text,
      /rotate|variety/i,
      `${name} must instruct model to rotate question types across chunks`
    );

    // Must strictly ban unverifiable personal or subjective questions
    assert.match(
      text,
      /subjectiv|unverifi|personal/i,
      `${name} must forbid subjective or unverifiable personal questions`
    );
  }
});

test('D-CROWD: getMockBookAnalysis assigns diverse D-CROWD question types across chunks', () => {
  const mockData = getMockBookAnalysis();
  assert.ok(Array.isArray(mockData.chunks), 'mock book analysis must have chunks');
  assert.ok(mockData.chunks.length >= 2, 'mock book analysis should have multiple chunks');

  const validDCrowdTypes = new Set([
    'completion_cloze',
    'sequential_recall',
    'observable_visual',
    'wh_causality',
    'distancing_schema',
  ]);

  for (const chunk of mockData.chunks) {
    assert.ok(
      validDCrowdTypes.has(chunk.question_type),
      `Chunk ${chunk.chunk_id} question_type "${chunk.question_type}" must be a valid D-CROWD type`
    );
  }

  // Ensure consecutive chunks do not have identical question types
  for (let i = 1; i < mockData.chunks.length; i++) {
    assert.notEqual(
      mockData.chunks[i].question_type,
      mockData.chunks[i - 1].question_type,
      `Consecutive chunks ${i} and ${i + 1} must rotate question_type`
    );
  }
});
