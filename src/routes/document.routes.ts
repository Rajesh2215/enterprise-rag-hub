import { Router } from 'express';
import multer, { MulterError } from 'multer';
import path from 'path';
import fs from 'fs';
import { authenticate } from '../middleware/authenticate.js';
import { documentController } from '../controllers/document.controller.js';
import type { AuthRequest } from '../middleware/authenticate.js';
import type { Request, Response, NextFunction } from 'express';

// ---- Multer storage: save PDFs to ./uploads/ ----
const uploadsDir = path.resolve('uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadsDir),
  filename: (_req, file, cb) => {
    const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    const ext = path.extname(file.originalname);
    cb(null, `${unique}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50 MB max
  fileFilter: (_req, file, cb) => {
    if (file.mimetype === 'application/pdf') cb(null, true);
    else cb(new Error('Only PDF files are allowed'));
  },
});

// ---- Router ----
const router = Router({ mergeParams: true }); // mergeParams exposes :chatbotId

router.use(authenticate);

router.post('/', (req: Request, res: Response, next: NextFunction) => {
  upload.single('file')(req, res, (err) => {
    if (err) {
      console.error('[Multer error]', err);
      if (err instanceof MulterError) {
        // e.g. LIMIT_FILE_SIZE
        res.status(400).json({ error: `Upload error: ${err.message}` });
      } else {
        // fileFilter rejection or other
        res.status(400).json({ error: err.message });
      }
      return;
    }
    documentController.upload(req as AuthRequest, res);
  });
});

router.get('/', (req, res) =>
  documentController.getAll(req as AuthRequest, res as Response)
);

router.get('/:documentId', (req, res) =>
  documentController.getById(req as AuthRequest, res as Response)
);

router.delete('/:documentId', (req, res) =>
  documentController.delete(req as AuthRequest, res as Response)
);

export default router;
