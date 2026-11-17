import express from 'express';
import multer from 'multer';
import { analyzeBookPages } from '../services/gemini_service.js';
import { evaluateChildAnswer } from '../services/answer_evaluator.js';
import { detectRetryCommand } from '../services/voice_command_detector.js';

const router = express.Router();

const ALLOWED_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB per file
    files: 20, // 20 files max (supports full multi-page chapters)
  },
  fileFilter: (req, file, cb) => {
    if (!ALLOWED_MIME_TYPES.has(file.mimetype)) {
      const err = new Error(`Unsupported file type: ${file.mimetype}. Only JPEG, PNG, and WebP are allowed.`);
      err.code = 'INVALID_FILE_TYPE';
      return cb(err);
    }
    cb(null, true);
  },
});

router.post('/analyze-book', upload.array('images'), async (req, res, next) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: 'No book images provided' });
    }

    const analysis = await analyzeBookPages(req.files);
    if (req.socket?.destroyed) {
      return;
    }

    if (!analysis || !analysis.is_legible) {
      return res.status(422).json({
        is_legible: false,
        error_message:
          (analysis && analysis.error_message) ||
          'Image appears too blurry or poorly lit to read.',
      });
    }

    return res.status(200).json(analysis);
  } catch (err) {
    next(err);
  }
});

router.post('/evaluate-answer', express.json(), async (req, res, next) => {
  try {
    if (!req.body || !req.body.checkin_question || !req.body.target_answer_concept) {
      return res.status(400).json({
        error: 'Missing required fields: checkin_question and target_answer_concept are required.',
      });
    }

    const result = await evaluateChildAnswer(req.body);
    if (req.socket?.destroyed) {
      return;
    }

    return res.status(200).json(result);
  } catch (err) {
    next(err);
  }
});

router.post('/detect-intent', express.json(), async (req, res, next) => {
  try {
    const transcript = req.body?.transcript || '';
    const result = await detectRetryCommand(transcript);
    if (req.socket?.destroyed) {
      return;
    }

    return res.status(200).json(result);
  } catch (err) {
    next(err);
  }
});

export default router;
