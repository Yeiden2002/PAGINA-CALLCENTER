import { parentPort, workerData } from 'node:worker_threads';
import { parseWorkbook } from './excelParser.js';
try { parentPort.postMessage({ result: parseWorkbook(Buffer.from(workerData.buffer), workerData.options, workerData.preview) }); }
catch (error) { parentPort.postMessage({ error: { status: error.status || 415, message: error.status ? error.message : 'No fue posible leer este Excel.' } }); }
