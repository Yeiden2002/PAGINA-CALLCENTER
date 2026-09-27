import {parentPort,workerData} from 'node:worker_threads';
import {parseTiempos} from './tiemposParser.js';
try{parentPort.postMessage({result:parseTiempos(Buffer.from(workerData.buffer),workerData.type)});}catch(error){parentPort.postMessage({error:{status:error.status||415,message:error.status?error.message:'No fue posible leer el archivo.'}});}
