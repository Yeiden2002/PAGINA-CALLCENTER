import mongoose from 'mongoose';
import { HttpError } from '../utils/validation.js';
export function validateObjectId(req, res, next) {
  if (!/^[a-f\d]{24}$/i.test(req.params.id) || !mongoose.Types.ObjectId.isValid(req.params.id)) return next(new HttpError(400, 'ID de asesor inválido.'));
  next();
}
