import express from 'express';
import multer from 'multer';
import { analyzeBookPages } from '../services/gemini_service.js';

const router = express.Router();

const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB per file
    files: 20, // 20 files max (supports full multi-page chapters)
  },
});

router.post('/analyze-book', upload.array('images'), async (req, res, next) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: 'No book images provided' });
    }

    const analysis = await analyzeBookPages(req.files);

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

export default router;
