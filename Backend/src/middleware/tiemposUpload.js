import multer from 'multer';
import path from 'node:path';
import {HttpError} from '../utils/validation.js';
const allowed={'.csv':['text/csv','application/csv','text/plain','application/vnd.ms-excel','application/octet-stream'],'.xlsx':['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','application/octet-stream'],'.xls':['application/vnd.ms-excel','application/octet-stream']};
export const tiemposUpload=multer({storage:multer.memoryStorage(),limits:{fileSize:5*1024*1024,files:1,fields:0,parts:1},fileFilter(req,file,cb){if(!allowed[path.extname(file.originalname).toLowerCase()]?.includes(file.mimetype))return cb(new HttpError(415,'Solo CSV, XLSX o XLS válidos.'));cb(null,true);}}).single('archivo');
