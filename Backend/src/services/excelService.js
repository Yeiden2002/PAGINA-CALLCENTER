import path from 'node:path';
import { Worker } from 'node:worker_threads';
import yauzl from 'yauzl';
import ExcelJS from 'exceljs';
import { HttpError } from '../utils/validation.js';
import { HEADERS } from './excelParser.js';
export async function validateContainer(file) {
  const buffer = file.buffer;
  if (path.extname(file.originalname).toLowerCase() === '.xls') {
    if (!buffer.subarray(0,8).equals(Buffer.from('d0cf11e0a1b11ae1','hex'))) throw new HttpError(415, 'El contenido no corresponde a un archivo .xls.');
    return;
  }
  if (!buffer.subarray(0,4).equals(Buffer.from('504b0304','hex'))) throw new HttpError(415, 'El contenido no corresponde a un archivo .xlsx.');
  await new Promise((resolve, reject) => {
    yauzl.fromBuffer(buffer, {lazyEntries:true, validateEntrySizes:true}, (error, zip) => {
      if (error) return reject(new HttpError(415, 'Archivo XLSX dañado.'));
      let total = 0, entries = 0, done = false;
      const names = new Set();
      const fail = err => { if (done) return; done = true; zip.close(); reject(err); };
      zip.on('error', () => fail(new HttpError(415, 'Archivo XLSX dañado.')));
      zip.on('entry', entry => {
        entries++; total += entry.uncompressedSize; names.add(entry.fileName);
        if (entries > 2000 || total > 30 * 1024 * 1024 || entry.uncompressedSize > 20 * 1024 * 1024) return fail(new HttpError(413, 'El Excel descomprimido supera los límites de seguridad.'));
        if (entry.generalPurposeBitFlag & 1 || /vbaProject\.bin$/i.test(entry.fileName)) return fail(new HttpError(415, 'No se admiten archivos cifrados ni macros.'));
        if (entry.fileName.endsWith('/')) { zip.readEntry(); return; }
        // Inflate with bounded streams first: do not trust ZIP size metadata alone.
        zip.openReadStream(entry, (streamError, stream) => {
          if (streamError) return fail(new HttpError(415, 'Contenido XLSX inválido.'));
          let actual = 0;
          stream.on('data', chunk => {
            actual += chunk.length;
            if (actual > entry.uncompressedSize || actual > 20 * 1024 * 1024) {
              stream.destroy(); fail(new HttpError(413, 'Contenido comprimido fuera de los límites permitidos.'));
            }
          });
          stream.on('error', () => fail(new HttpError(415, 'Contenido comprimido inválido.')));
          stream.on('end', () => { if (!done) zip.readEntry(); });
        });
      });
      zip.on('end', () => {
        if (done) return;
        done = true;
        if (!names.has('xl/workbook.xml') || !names.has('[Content_Types].xml')) reject(new HttpError(415, 'El archivo no contiene un libro XLSX válido.'));
        else resolve();
      });
      zip.readEntry();
    });
  });
}
export async function readExcel(file, options, preview) {
  if (!file) throw new HttpError(400, 'Selecciona un archivo Excel.');
  await validateContainer(file);
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./excelWorker.js', import.meta.url), {workerData: {buffer:file.buffer, options, preview}, resourceLimits: {maxOldGenerationSizeMb:128}});
    const timer = setTimeout(() => { void worker.terminate(); reject(new HttpError(413, 'El Excel requiere demasiado tiempo para procesarse. Divide el archivo.')); }, 15000);
    worker.once('message', message => { clearTimeout(timer); void worker.terminate(); message.error ? reject(new HttpError(message.error.status,message.error.message)) : resolve(message.result); });
    worker.once('error', () => { clearTimeout(timer); reject(new HttpError(415,'No fue posible procesar el archivo de forma segura.')); });
    worker.once('exit', code => { clearTimeout(timer); if (code !== 0) reject(new HttpError(415,'El procesamiento del archivo se interrumpió.')); });
  });
}
// ExcelJS writes strings as text, never as formulas. No untrusted formula objects are used.
export function safeExcelText(value) { return String(value); }
export async function exportExcel(cursor, output) {
  const workbook = new ExcelJS.stream.xlsx.WorkbookWriter({ stream: output, useStyles: true, useSharedStrings: false });
  const sheet = workbook.addWorksheet('Hoja1', { views: [{state:'frozen',ySplit:1}] });
  sheet.columns = [22,44,14,19,24].map(width => ({width}));
  const header = sheet.addRow(HEADERS);
  header.height = 30.75;
  header.eachCell(cell => {
    cell.font = { name:'Calibri',size:11,color:{argb:'FF000000'} };
    cell.fill = { type:'pattern',pattern:'solid',fgColor:{argb:'FFBDD7EE'} };
    cell.alignment = {horizontal:'center',vertical:'middle',wrapText:true};
    cell.border = {top:{style:'medium'},bottom:{style:'medium'},left:{style:'thin'},right:{style:'thin'}};
  });
  header.commit();
  try {
    for await (const asesor of cursor) {
      if (output.destroyed) break;
      const row = sheet.addRow([safeExcelText(asesor.campana),safeExcelText(asesor.nombreAsesor),asesor.jornada,asesor.tiempoBreak/1440,safeExcelText(asesor.horario)]);
      row.height = 18;
      row.eachCell((cell,col) => {
        cell.font = {name:'Calibri',size:11,bold:col<=3};
        cell.border = {top:{style:'thin'},bottom:{style:'thin'},left:{style:'thin'},right:{style:'thin'}};
        cell.alignment = {vertical:'middle',horizontal:col>2?'center':'left'};
        if (col===4) { cell.numFmt='h:mm:ss';cell.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FFD9D9D9'}}; }
        else if (col===3) cell.numFmt='General';
        else cell.numFmt='@';
        if (col===3||col===5) cell.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FFD9E2F3'}};
      });
      row.commit();
    }
    sheet.commit(); await workbook.commit();
  } finally { await cursor.close(); }
}
