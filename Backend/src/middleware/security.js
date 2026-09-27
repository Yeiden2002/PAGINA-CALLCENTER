import helmet from 'helmet';
import cors from 'cors';
import {HttpError} from '../utils/validation.js';

function configuredOrigins() {
  return (process.env.FRONTEND_URL || (process.env.NODE_ENV === 'production' ? '' : 'http://localhost:5173')).split(',').map(value => value.trim()).filter(Boolean);
}
export function isAllowedOrigin(origin) {
  // Non-browser clients still need the custom CSRF header and an authenticated session.
  return !origin || configuredOrigins().includes(origin);
}
export function applySecurity(app) {
  const origins = configuredOrigins();
  if (!origins.length || origins.some(origin => {
    try { const url = new URL(origin); return url.origin !== origin || !['http:','https:'].includes(url.protocol) || (process.env.NODE_ENV === 'production' && url.protocol !== 'https:'); }
    catch { return true; }
  })) throw new Error('FRONTEND_URL debe contener orígenes explícitos válidos (HTTPS en producción).');
  // One trusted ingress hop only. Enable exclusively behind Render's public ingress.
  if (process.env.TRUST_PROXY === 'render') app.set('trust proxy', 1);
  else if (process.env.TRUST_PROXY && process.env.TRUST_PROXY !== 'none') throw new Error('TRUST_PROXY inválido.');
  app.disable('x-powered-by');
  app.set('query parser', 'simple');
  app.use(helmet());
  app.use(cors({
    origin(origin, callback) {
      if (isAllowedOrigin(origin)) return callback(null, true);
      callback(new HttpError(403, 'Origen no autorizado.'));
    },
    methods:['GET','POST','PUT','PATCH','DELETE','OPTIONS'],
    credentials:true,
    allowedHeaders:['Content-Type','X-EAD-Request'],
    exposedHeaders:['Content-Disposition'],
    maxAge:600,
  }));
}
