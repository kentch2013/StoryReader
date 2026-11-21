import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import bookRoutes from './routes/book_routes.js';
import { getNLIModel } from './services/semantic_evaluator.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '.env') });

export function createServer() {
  const app = express();

  const corsOptions = process.env.ALLOWED_ORIGIN
    ? { origin: process.env.ALLOWED_ORIGIN }
    : {};
  app.use(cors(corsOptions));
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true }));
  app.use(express.static(path.join(__dirname, 'public')));

  app.get('/api/health', (req, res) => {
    res.json({
      status: 'ok',
      service: 'StoryReader',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
    });
  });

  app.use((req, res, next) => {
    if (!process.env.AUTH_SECRET) {
      return next();
    }
    if (req.path === '/api/health') {
      return next();
    }
    const authHeader = req.headers.authorization;
    if (!authHeader || authHeader !== `Bearer ${process.env.AUTH_SECRET}`) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Valid authorization token required.',
      });
    }
    next();
  });

  app.use('/api', bookRoutes);

  app.use('/api', (req, res) => {
    res.status(404).json({
      error: 'Not Found',
      path: req.originalUrl,
    });
  });

  app.use((err, req, res, next) => {
    if (err && err.name === 'MulterError') {
      const status = err.code === 'LIMIT_FILE_SIZE' ? 413 : 400;
      return res.status(status).json({
        error: err.message,
        code: err.code,
      });
    }

    if (err && err.code === 'INVALID_FILE_TYPE') {
      return res.status(400).json({
        error: err.message,
        code: err.code,
      });
    }

    console.error('Unhandled server error:', err);
    const status = err.status || 500;
    const isProduction = process.env.NODE_ENV === 'production';
    const message = (status >= 500 && isProduction)
      ? 'Internal Server Error'
      : (err.message || 'Internal Server Error');

    res.status(status).json({
      error: message,
      code: err.code,
    });
  });

  return app;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const app = createServer();
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`StoryReader host listening on port ${PORT}`);
    getNLIModel()
      .then(() => console.log('✅ [TIER 2] Gemini Decision 1 Service online.'))
      .catch((err) => console.warn('⚠️ [TIER 2] Could not initialize evaluator:', err.message));
  });
}
