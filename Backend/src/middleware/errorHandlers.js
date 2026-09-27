import multer from 'multer';
import { HttpError } from '../utils/validation.js';
export function notFound(req, res) { res.status(404).json({ success: false, message: 'Ruta no encontrada.' }); }
export function errorHandler(error, req, res, next) {
  if (res.headersSent) return next(error);
  let status = 500, message = 'No fue posible procesar la solicitud.';
  if (error instanceof HttpError) { status = error.status; message = error.message; }
  else if (error.code === 11000) { status = 409; message = 'El registro ya existe (asesor, fecha o archivo duplicado).'; }
  else if (error instanceof multer.MulterError) {
    status = error.code === 'LIMIT_FILE_SIZE' ? 413 : 400;
    message = error.code === 'LIMIT_FILE_SIZE' ? 'El archivo supera el límite de 5 MB.' : 'Carga un solo archivo por petición y únicamente los campos permitidos.';
  } else if (error.type === 'entity.too.large') { status = 413; message = 'La solicitud supera el tamaño permitido.'; }
  else if (error.type === 'entity.parse.failed') { status = 400; message = 'JSON inválido.'; }
  else if (['ValidationError', 'StrictModeError', 'CastError'].includes(error.name)) { status = 400; message = 'Los datos enviados no son válidos.'; }
  else if (['MongoServerSelectionError', 'MongoNetworkError'].includes(error.name)) { status = 503; message = 'La base de datos no está disponible.'; }
  if (status >= 500) console.error('Error de API:', error.name, error.code || '', process.env.NODE_ENV === 'development' ? error.message : '');
  res.status(status).json({ success: false, message });
}
