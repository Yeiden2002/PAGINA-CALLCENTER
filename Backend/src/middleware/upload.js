import multer from 'multer';
import path from 'node:path';
import { HttpError } from '../utils/validation.js';
const mimes = {
  '.xlsx': ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/octet-stream', 'application/zip'],
  '.xls': ['application/vnd.ms-excel', 'application/octet-stream', 'application/x-ole-storage'],
};
export const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 1, fields: 2, fieldSize: 8192, parts: 3, fieldNameSize: 50 },
  fileFilter(req, file, callback) {
    const extension = path.extname(file.originalname).toLowerCase();
    if (!mimes[extension]?.includes(file.mimetype)) return callback(new HttpError(415, 'Solo se permiten archivos Excel .xlsx o .xls válidos.'));
    callback(null, true);
  },
}).single('archivo');
let active = 0;
export function importCapacity(req, res, next) {
  if (active >= 2) return next(new HttpError(429, 'Hay otras importaciones en proceso. Intenta de nuevo en unos momentos.'));
  active++;
  let released = false;
  const release = () => { if (!released) { released = true; active--; } };
  res.once('finish', release); res.once('close', release);
  next();
}
