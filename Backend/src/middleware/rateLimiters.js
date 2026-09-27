import { rateLimit } from 'express-rate-limit';
const makeLimiter = (limit, windowMs) => rateLimit({
  windowMs, limit, standardHeaders: 'draft-8', legacyHeaders: false,
  handler: (req, res) => res.status(429).json({ success: false, message: 'Demasiadas solicitudes. Espera antes de intentar nuevamente.' }),
});
export const apiLimiter = makeLimiter(600, 15 * 60 * 1000);
export const writeLimiter = makeLimiter(120, 15 * 60 * 1000);
export const importLimiter = makeLimiter(60, 15 * 60 * 1000);
export const exportLimiter = makeLimiter(20, 15 * 60 * 1000);
