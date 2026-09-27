import XLSX from 'xlsx';
import { asesorInput, HttpError, object, fields, clean } from '../utils/validation.js';
export const HEADERS = ['CAMPAÑA', 'NOMBRE ASESOR', 'JORNADA', 'TIEMPO BREAK', 'HORARIO'];
const required = fields.slice(0, 5);
const key = value => String(value ?? '').normalize('NFD').replace(/\p{M}/gu, '').toUpperCase().replace(/[^A-Z0-9]/g, '');
const aliases = {
  campana: ['CAMPAÑA', 'CAMPAIGN', 'CAMPAÑA ASESOR'],
  nombreAsesor: ['NOMBRE ASESOR', 'ASESOR', 'NOMBRE', 'NOMBRE COMPLETO', 'NOMBRE DEL ASESOR'],
  jornada: ['JORNADA', 'JORNADA HORAS', 'HORAS', 'HORAS JORNADA'],
  tiempoBreak: ['TIEMPO BREAK', 'BREAK', 'DESCANSO', 'TIEMPO DESCANSO', 'DESCANSO MINUTOS', 'BREAK MINUTOS'],
  horario: ['HORARIO', 'HORARIO LABORAL', 'TURNO'],
  estatus: ['ESTATUS', 'ESTADO', 'STATUS'],
};
const aliasMap = new Map(Object.entries(aliases).flatMap(([field, names]) => names.map(name => [key(name), field])));
const MAX_ROWS = 10000, MAX_COLUMNS = 100;
function detect(sheet, range) {
  let best = { row: range.s.r, mapping: {}, score: 0 };
  for (let row = range.s.r; row <= Math.min(range.e.r, range.s.r + 99); row++) {
    const mapping = {}, repeated = new Set();
    for (let col = range.s.c; col <= range.e.c; col++) {
      const field = aliasMap.get(key(sheet[XLSX.utils.encode_cell({ r: row, c: col })]?.v));
      if (field) { if (mapping[field] !== undefined) repeated.add(field); else mapping[field] = col; }
    }
    for (const field of repeated) delete mapping[field];
    const score = required.filter(field => mapping[field] !== undefined).length;
    if (score > best.score) best = { row, mapping, score };
  }
  return best;
}
function valueOf(cell, label, warnings) {
  if (!cell) return undefined;
  if (cell.t === 'e') throw new HttpError(400, `${label}: la celda contiene un error de Excel.`);
  if (cell.f) {
    if (cell.v === undefined || cell.v === null || (typeof cell.v === 'string' && cell.v.trim() === '')) throw new HttpError(400, `${label}: fórmula sin resultado guardado. Guarda el Excel con valores calculados.`);
    warnings.count++;
  }
  return cell.v;
}
function duration(cell, field, unit, warnings) {
  const value = valueOf(cell, field === 'jornada' ? 'Jornada' : 'Tiempo break', warnings);
  if (value === undefined || value === null || value === '') throw new HttpError(400, `${field === 'jornada' ? 'Jornada' : 'Tiempo break'} es obligatorio.`);
  let result;
  if (typeof value === 'number') {
    const timeFormat = /[hs]/i.test(cell.z || '');
    if (unit === 'excel' || (unit === 'auto' && (timeFormat || (field === 'tiempoBreak' && value > 0 && value < 1)))) result = value * (field === 'jornada' ? 24 : 1440);
    else if (unit === 'minutos') result = field === 'jornada' ? value / 60 : value;
    else if (unit === 'horas') result = field === 'jornada' ? value : value * 60;
    else result = value;
  } else if (typeof value === 'string') {
    const raw = clean(value).toLowerCase();
    const clock = raw.match(/^(\d{1,2}):([0-5]\d)(?::([0-5]\d))?$/);
    const numeric = raw.match(/^(\d+(?:[.,]\d+)?)\s*(h|hr|hrs|hora|horas|min|mins|minuto|minutos)?$/);
    if (clock) result = (+clock[1] * 60 + +clock[2] + +(clock[3] || 0) / 60) / (field === 'jornada' ? 60 : 1);
    else if (numeric) {
      const suffix = numeric[2];
      const parsedUnit = suffix ? (suffix.startsWith('h') ? 'horas' : 'minutos') : unit;
      return duration({ v: +numeric[1].replace(',', '.'), z: '' }, field, parsedUnit, warnings);
    } else throw new HttpError(400, `${field}: duración no reconocida.`);
  } else throw new HttpError(400, `${field}: tipo de celda inválido.`);
  const rounded = field === 'jornada' ? Math.round(result * 60) / 60 : Math.round(result);
  if (Math.abs(result - rounded) > 0.00001) throw new HttpError(400, `${field}: utiliza minutos enteros.`);
  return rounded;
}
export function parseWorkbook(buffer, options = {}, preview = false) {
  object(options, ['sheet', 'headerRow', 'mapping', 'jornadaUnit', 'breakUnit']);
  for (const unit of [options.jornadaUnit, options.breakUnit]) if (unit !== undefined && !['auto','horas','minutos','excel'].includes(unit)) throw new HttpError(400, 'Unidad de tiempo inválida.');
  let wb;
  try { wb = XLSX.read(buffer, { type: 'buffer', cellNF: true, cellFormula: true, cellDates: false, sheetRows: MAX_ROWS + 102, bookVBA: false }); }
  catch { throw new HttpError(415, 'El archivo está dañado, cifrado o no es un Excel compatible.'); }
  if (!wb.SheetNames.length || wb.SheetNames.length > 20) throw new HttpError(400, 'El libro debe contener entre 1 y 20 hojas.');
  const sheets = wb.SheetNames.map(name => {
    const sheet = wb.Sheets[name];
    let range;
    try { range = XLSX.utils.decode_range(sheet['!fullref'] || sheet['!ref'] || 'A1'); } catch { throw new HttpError(400, 'Rango de hoja inválido.'); }
    if (range.e.r >= MAX_ROWS + 100 || range.e.c >= MAX_COLUMNS) throw new HttpError(413, 'Máximo 10,000 filas de datos y 100 columnas por hoja.');
    return { name, range, detected: detect(sheet, range) };
  });
  let info;
  if (options.sheet !== undefined) {
    if (typeof options.sheet !== 'string') throw new HttpError(400, 'Hoja inválida.');
    info = sheets.find(sheet => sheet.name === options.sheet);
    if (!info) throw new HttpError(400, 'La hoja seleccionada no existe.');
  } else info = [...sheets].sort((a,b) => b.detected.score - a.detected.score)[0];
  const sheet = wb.Sheets[info.name];
  const headerRow = options.headerRow ?? info.detected.row + 1;
  if (!Number.isInteger(headerRow) || headerRow < 1 || headerRow > Math.min(100, info.range.e.r + 1)) throw new HttpError(400, 'La fila de encabezados debe estar entre 1 y 100 y existir en la hoja.');
  const columns = [];
  const automatic = {}, repeats = new Set();
  for (let col = 0; col <= info.range.e.c; col++) {
    const cell = sheet[XLSX.utils.encode_cell({ r: headerRow - 1, c: col })];
    const label = String(cell?.v ?? '').slice(0, 120);
    columns.push({ index: col, label: `${XLSX.utils.encode_col(col)} · ${label || '(sin encabezado)'}` });
    const field = aliasMap.get(key(label));
    if (field) { if (automatic[field] !== undefined) repeats.add(field); else automatic[field] = col; }
  }
  for (const field of repeats) delete automatic[field];
  const mapping = options.mapping ?? automatic;
  object(mapping, fields);
  const mapped = Object.values(mapping);
  if (mapped.some(col => !Number.isInteger(col) || col < 0 || col > info.range.e.c) || new Set(mapped).size !== mapped.length) throw new HttpError(400, 'Las columnas asignadas deben existir y no repetirse.');
  const missing = required.filter(field => mapping[field] === undefined);
  const meta = { sheets: sheets.map(s => s.name), sheet: info.name, headerRow, mapping, columns, missing };
  if (preview) {
    const sample = [];
    for (let row = headerRow; row <= Math.min(info.range.e.r, headerRow + 4); row++) {
      sample.push({ fila: row + 1, values: columns.map(({index}) => {
        const cell = sheet[XLSX.utils.encode_cell({r: row, c: index})];
        return String(cell?.w ?? cell?.v ?? '').slice(0, 160);
      }) });
    }
    return { ...meta, sample };
  }
  if (missing.length) throw new HttpError(400, `Asigna las columnas obligatorias: ${missing.join(', ')}.`);
  const rows = [], errors = [], warnings = {count:0};
  let total = 0;
  const merged = sheet['!merges'] || [];
  function getCell(row, col) {
    const cell = sheet[XLSX.utils.encode_cell({r:row,c:col})];
    if (cell?.v !== undefined || cell?.f) return cell;
    const merge = merged.find(m => m.s.c === col && m.e.c === col && row >= m.s.r && row <= m.e.r && m.s.r >= headerRow);
    return merge ? sheet[XLSX.utils.encode_cell(merge.s)] : cell;
  }
  for (let row = headerRow; row <= info.range.e.r; row++) {
    const direct = mapped.map(col => sheet[XLSX.utils.encode_cell({r:row,c:col})]);
    if (direct.every(cell => !cell || (cell.v === undefined && !cell.f) || (typeof cell.v === 'string' && cell.v.trim() === ''))) continue;
    if (required.every(field => aliasMap.get(key(direct[mapped.indexOf(mapping[field])]?.v)) === field)) continue;
    total++;
    if (total > MAX_ROWS) throw new HttpError(413, 'Máximo 10,000 registros por archivo.');
    try {
      const cell = field => getCell(row, mapping[field]);
      const data = asesorInput({
        campana: valueOf(cell('campana'), 'Campaña', warnings),
        nombreAsesor: valueOf(cell('nombreAsesor'), 'Nombre asesor', warnings),
        jornada: duration(cell('jornada'), 'jornada', options.jornadaUnit || 'auto', warnings),
        tiempoBreak: duration(cell('tiempoBreak'), 'tiempoBreak', options.breakUnit || 'auto', warnings),
        horario: valueOf(cell('horario'), 'Horario', warnings),
        estatus: mapping.estatus === undefined ? 'Activo' : valueOf(cell('estatus'), 'Estatus', warnings),
      });
      rows.push({ fila: row + 1, data });
    } catch (error) { errors.push({ fila: row + 1, motivo: error instanceof HttpError ? error.message : 'Fila inválida.' }); }
  }
  return { ...meta, rows, total, errors, formulaValues: warnings.count };
}
