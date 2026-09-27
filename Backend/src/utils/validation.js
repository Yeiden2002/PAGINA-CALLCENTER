export class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
export const clean = value => value.normalize('NFKC').trim().replace(/\s+/gu, ' ');
export const normalized = value => clean(value).toLocaleLowerCase('es');
export const fields = ['campana', 'nombreAsesor', 'jornada', 'tiempoBreak', 'horario', 'estatus'];
export function object(value, allowed) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new HttpError(400, 'Se espera un objeto válido.');
  if (Object.keys(value).some(key => !allowed.includes(key))) throw new HttpError(400, 'La solicitud contiene campos no permitidos.');
}
export function text(value, label, max = 120) {
  if (typeof value !== 'string' || value.length > max * 2 || /[\x00-\x1f\x7f]/u.test(value)) throw new HttpError(400, `${label}: texto inválido.`);
  const result = clean(value);
  if (!result || result.length > max) throw new HttpError(400, `${label}: escribe entre 1 y ${max} caracteres.`);
  return result;
}
export function number(value, label, min, max) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max || Math.abs(value * 60 - Math.round(value * 60)) > 0.00001) {
    throw new HttpError(400, `${label}: número entre ${min} y ${max}, con precisión de minutos.`);
  }
  return value;
}
export function status(value) {
  if (!['Activo', 'Inactivo'].includes(value)) throw new HttpError(400, 'Estatus debe ser Activo o Inactivo.');
  return value;
}
export function schedule(value) {
  const raw = text(value, 'Horario', 60).toUpperCase();
  const match = raw.match(/^(\d{1,2}):([0-5]\d)\s*(?:A|AL|HASTA|[-–—])\s*(\d{1,2}):([0-5]\d)$/u);
  if (!match || +match[1] > 23 || +match[3] > 23) throw new HttpError(400, 'Horario: usa HH:MM A HH:MM (24 horas).');
  const start = +match[1] * 60 + +match[2], end = +match[3] * 60 + +match[4];
  if (start === end) throw new HttpError(400, 'El inicio y fin del horario deben ser diferentes.');
  return `${match[1].padStart(2, '0')}:${match[2]} A ${match[3].padStart(2, '0')}:${match[4]}`;
}
export function asesorInput(body) {
  object(body, fields);
  const data = {
    campana: text(body.campana, 'Campaña', 100),
    nombreAsesor: text(body.nombreAsesor, 'Nombre asesor', 160),
    jornada: number(body.jornada, 'Jornada (horas)', 0.25, 24),
    tiempoBreak: number(body.tiempoBreak, 'Tiempo break (minutos)', 0, 240),
    horario: schedule(body.horario),
    estatus: status(body.estatus === undefined ? 'Activo' : body.estatus),
  };
  if (!Number.isInteger(data.tiempoBreak)) throw new HttpError(400, 'El descanso debe expresarse en minutos enteros.');
  if (data.tiempoBreak >= data.jornada * 60) throw new HttpError(400, 'El descanso debe ser menor que la jornada.');
  return { ...data, campanaNormalizada: normalized(data.campana), nombreNormalizado: normalized(data.nombreAsesor) };
}
const escapeRegex = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
export function listQuery(query) {
  object(query, ['page', 'limit', 'search', 'campana', 'estatus', 'jornada']);
  for (const value of Object.values(query)) if (typeof value !== 'string') throw new HttpError(400, 'Parámetros de consulta inválidos.');
  function integer(value, fallback, max) {
    if (value === undefined) return fallback;
    if (!/^\d{1,6}$/.test(value) || +value < 1 || +value > max) throw new HttpError(400, 'Página o límite fuera de rango.');
    return +value;
  }
  const page = integer(query.page, 1, 100000), limit = integer(query.limit, 25, 100);
  const filter = {};
  if (query.search) {
    const search = escapeRegex(normalized(text(query.search, 'Búsqueda', 80)));
    filter.$or = [{ nombreNormalizado: { $regex: search } }, { campanaNormalizada: { $regex: search } }];
  }
  if (query.campana) filter.campanaNormalizada = normalized(text(query.campana, 'Campaña', 100));
  if (query.estatus) filter.estatus = status(query.estatus);
  if (query.jornada) {
    if (!/^\d{1,2}(?:\.\d{1,4})?$/.test(query.jornada)) throw new HttpError(400, 'Jornada inválida.');
    filter.jornada = number(+query.jornada, 'Jornada', 0.25, 24);
  }
  return { page, limit, filter };
}
