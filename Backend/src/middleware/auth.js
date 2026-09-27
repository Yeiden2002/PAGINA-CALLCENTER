import {createHash} from 'node:crypto';
import {parse} from 'cookie';
import Sesion from '../models/Sesion.js';
import Usuario from '../models/Usuario.js';
import {HttpError} from '../utils/validation.js';
import {isAllowedOrigin} from './security.js';
export const COOKIE='nexo_session';
export const digest=value=>createHash('sha256').update(value).digest('hex');
export async function requireAuth(req,res,next){
  const token=parse(req.headers.cookie||'')[COOKIE];
  if(!token||!/^[a-f0-9]{64}$/.test(token))throw new HttpError(401,'Inicia sesión para continuar.');
  const session=await Sesion.findOne({tokenHash:digest(token),expiresAt:{$gt:new Date()}}).lean();
  if(!session)throw new HttpError(401,'La sesión expiró. Inicia sesión de nuevo.');
  const user=await Usuario.findById(session.usuarioId).select('usuario').lean();
  if(!user)throw new HttpError(401,'Sesión inválida.');
  req.auth={user,session};next();
}
export function requireSameOriginWrite(req,res,next){
  if(['GET','HEAD','OPTIONS'].includes(req.method))return next();
  if(req.get('X-EAD-Request')!=='1')return next(new HttpError(403,'La solicitud no incluye la protección contra CSRF.'));
  if(!isAllowedOrigin(req.get('Origin'),req))return next(new HttpError(403,'Origen no autorizado.'));
  next();
}
