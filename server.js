import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import bookRoutes from './routes/book_routes.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export function createServer() {
  const app = express();

  app.use(cors());
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
    res.status(err.status || 500).json({
      error: err.message || 'Internal Server Error',
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
  });
}
