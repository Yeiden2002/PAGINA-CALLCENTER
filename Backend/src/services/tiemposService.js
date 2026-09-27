import path from 'node:path';
import {Worker} from 'node:worker_threads';
import {randomUUID,createHash} from 'node:crypto';
import Asesor from '../models/Asesor.js';
import Importacion from '../models/ImportacionTiempos.js';
import Tiempo from '../models/TiempoDiario.js';
import {HttpError,clean} from '../utils/validation.js';
import {EDITABLE} from '../utils/tiempo.js';
import {processDailyMetrics,recalculateMetrics} from './processMetrics.js';
import {validateContainer} from './excelService.js';
import {storedName,saveOriginal,deleteOriginal} from '../storage/tiemposStorage.js';
export const ACTIVE=['Procesado','Con observaciones'];
const nameKey=value=>clean(value).toLocaleUpperCase('es');
export function publicImport(doc){const {nombreArchivoAlmacenado,operacion,versionActiva,__v,...rest}=doc.toObject?doc.toObject():doc;return rest;}
export async function activeImport(id){const doc=await Importacion.findOne({_id:id,estado:{$in:ACTIVE}});if(!doc)throw new HttpError(404,'Importación no encontrada.');return doc;}
async function parseFile(file){
 if(!file)throw new HttpError(400,'Selecciona un archivo.');
 const type=path.extname(file.originalname).slice(1).toLowerCase();
 if(!['csv','xls','xlsx'].includes(type))throw new HttpError(415,'Formato no admitido.');
 if(type!=='csv')await validateContainer(file);
 const parsed=await new Promise((resolve,reject)=>{
  const worker=new Worker(new URL('./tiemposWorker.js',import.meta.url),{workerData:{buffer:file.buffer,type},resourceLimits:{maxOldGenerationSizeMb:128}});
  const timer=setTimeout(()=>{void worker.terminate();reject(new HttpError(413,'El archivo tarda demasiado en procesarse.'));},15000);
  worker.once('message',message=>{clearTimeout(timer);void worker.terminate();message.error?reject(new HttpError(message.error.status,message.error.message)):resolve(message.result);});
  worker.once('error',()=>{clearTimeout(timer);reject(new HttpError(415,'No fue posible leer el archivo.'));});
  worker.once('exit',code=>{clearTimeout(timer);if(code!==0)reject(new HttpError(415,'Lectura interrumpida.'));});
 });
 return {...parsed,type,hash:createHash('sha256').update(file.buffer).digest('hex'),original:clean(path.basename(file.originalname.replaceAll('\\','/'))).replace(/[\x00-\x1f\x7f]/g,'').slice(0,200)};
}
async function prepare(parsed,id,version){
 const asesores=await Asesor.find().lean();const map=new Map();
 for(const asesor of asesores){const key=nameKey(asesor.nombreAsesor);map.set(key,[...(map.get(key)||[]),asesor]);}
 const counts=new Map();for(const row of parsed.rows)counts.set(nameKey(row.name),(counts.get(nameKey(row.name))||0)+1);
 const errors=[...parsed.errors,...(parsed.warnings||[])],records=[];const matched=new Set();
 for(const row of parsed.rows){
  if(counts.get(nameKey(row.name))>1){errors.push({fila:row.fila,nombre:row.name,motivo:'Nombre repetido en el archivo; no se sumaron sus filas.'});continue;}
  const candidates=map.get(nameKey(row.name))||[];const asesor=candidates.length===1?candidates[0]:null;
  if(asesor)matched.add(String(asesor._id));
  else errors.push({fila:row.fila,nombre:row.name,motivo:candidates.length?'Nombre ambiguo entre campañas.':'No existe un asesor con este nombre.'});
  const metrics=processDailyMetrics(row,asesor);
  for(const motivo of metrics.diagnosticos)errors.push({fila:row.fila,nombre:row.name,motivo});
  records.push({importacionId:id,version,fecha:parsed.fecha,asesorId:asesor?._id||null,nombreAsesor:asesor?.nombreAsesor||row.name,campana:asesor?.campana||'',...metrics,archivoOrigen:parsed.original,estado:asesor?'Identificado':'No identificado',datosOrigen:row});
 }
 if(!records.length)throw new HttpError(400,'No hay filas procesables; revisa los nombres repetidos.');
 // Keep the reference roster visible without inventing zero-valued attendance.
 for(const asesor of asesores.filter(a=>a.estatus==='Activo'&&!matched.has(String(a._id))))records.push({importacionId:id,version,fecha:parsed.fecha,asesorId:asesor._id,nombreAsesor:asesor.nombreAsesor,campana:asesor.campana,archivoOrigen:parsed.original,estado:'Sin registro',...processDailyMetrics(null,asesor)});
 const advertencias=[];
 const namedDate=parsed.original.match(/^(\d{2})(\d{2})(\d{2})\.(csv|xlsx|xls)$/i);
 if(namedDate){const date=`20${namedDate[3]}-${namedDate[2]}-${namedDate[1]}`;if(date!==parsed.fecha)advertencias.push(`El nombre sugiere ${date}, pero los registros corresponden a ${parsed.fecha}. Se utilizó la fecha interna.`);}
 const sourceRecords=records.filter(r=>r.estado!=='Sin registro');
 return {records,metadata:{nombreArchivoOriginal:parsed.original,fechaDatos:parsed.fecha,hashArchivo:parsed.hash,tipoArchivo:parsed.type,registrosEncontrados:parsed.total,registrosProcesados:sourceRecords.length,registrosCorrectos:sourceRecords.filter(r=>r.estado==='Identificado').length,registrosConError:parsed.total-sourceRecords.length,asesoresNoIdentificados:sourceRecords.filter(r=>r.estado==='No identificado').length,incidencias:errors,advertencias,estado:errors.length||advertencias.length?'Con observaciones':'Procesado'}};
}
// A single document pointer publishes a complete revision on standalone MongoDB.
// The persisted journal makes file/record cleanup restartable after a crash.
export async function recoverImport(doc){
 const op=doc.operacion;
 if(doc.estado==='Eliminando'){
  await Tiempo.deleteMany({importacionId:doc._id});
  for(const name of new Set([doc.nombreArchivoAlmacenado,op?.archivoNuevo,op?.archivoAnterior]))await deleteOriginal(name);
  await Importacion.deleteOne({_id:doc._id});return;
 }
 if(!doc.versionActiva){
  await Tiempo.deleteMany({importacionId:doc._id});await deleteOriginal(op?.archivoNuevo);await Importacion.deleteOne({_id:doc._id});return;
 }
 if(op?.tipo==='reemplazar'){
  const published=doc.versionActiva===op.versionNueva;
  await Tiempo.deleteMany({importacionId:doc._id,version:published?op.versionAnterior:op.versionNueva});
  await deleteOriginal(published?op.archivoAnterior:op.archivoNuevo);
 }
 await Importacion.updateOne({_id:doc._id},{$set:{operacion:null}});
}
export async function recoverOperations(){for(const doc of await Importacion.find({$or:[{operacion:{$ne:null}},{estado:{$in:['Preparando','Eliminando']}}]}))await recoverImport(doc);}
export async function importFile(file,user,id){
 const parsed=await parseFile(file);const version=randomUUID(),filename=storedName(parsed.type);
 const duplicate=await Importacion.findOne({hashArchivo:parsed.hash});if(duplicate&&String(duplicate._id)!==id)throw new HttpError(409,'Este archivo ya fue importado.');
 let doc=id?await activeImport(id):null;
 if(doc&&doc.fechaDatos!==parsed.fecha)throw new HttpError(400,'El reemplazo debe corresponder a la misma fecha.');
 if(id&&parsed.errors.length)throw new HttpError(400,'El reemplazo contiene filas inválidas. Corrígelas antes de sustituir el archivo.');
 const newId=doc?._id||new Importacion()._id;const prepared=await prepare(parsed,newId,version);
 if(id&&prepared.metadata.registrosConError)throw new HttpError(400,'El reemplazo contiene nombres repetidos o filas inválidas.');
 const operation={tipo:id?'reemplazar':'crear',versionNueva:version,archivoNuevo:filename,versionAnterior:doc?.versionActiva,archivoAnterior:doc?.nombreArchivoAlmacenado};
 if(id){doc=await Importacion.findOneAndUpdate({_id:id,versionActiva:doc.versionActiva,operacion:null,estado:{$in:ACTIVE}},{$set:{operacion:operation}},{returnDocument:'after'});if(!doc)throw new HttpError(409,'Hay otra operación en curso.');}
 else{
  if(await Importacion.exists({fechaDatos:parsed.fecha}))throw new HttpError(409,'Ya existe un archivo para esta fecha. Usa Reemplazar.');
  try{doc=await Importacion.create({_id:newId,...prepared.metadata,estado:'Preparando',operacion:operation,tamanoArchivo:file.size,creadoPor:user._id});}
  catch(error){if(error.code===11000)throw new HttpError(409,'La fecha o el archivo ya están registrados.');throw error;}
 }
 try{
  await saveOriginal(filename,file.buffer);
  await Tiempo.insertMany(prepared.records,{ordered:true});
  doc=await Importacion.findOneAndUpdate({_id:doc._id,'operacion.versionNueva':version},{$set:{...prepared.metadata,tamanoArchivo:file.size,nombreArchivoAlmacenado:filename,versionActiva:version}},{returnDocument:'after',runValidators:true});
  await recoverImport(doc);
  return publicImport(doc);
 }catch(error){
  // Re-read publication state; never remove an already published revision.
  const current=await Importacion.findById(newId);
  if(current){try{await recoverImport(current);}catch{throw new HttpError(503,'La operación necesita recuperación. Reinicia el backend para finalizar la limpieza segura.');}}
  if(error.code===11000)throw new HttpError(409,'Este archivo ya fue importado.');throw error;
 }
}
export async function deleteImport(id){
 const doc=await Importacion.findOneAndUpdate({_id:id,operacion:null,estado:{$in:ACTIVE}},{$set:{estado:'Eliminando',operacion:{tipo:'eliminar'}}},{returnDocument:'after'});
 if(!doc)throw new HttpError(409,'Importación inexistente u ocupada.');
 await recoverImport(doc);
}
export async function editRecord(id,values,user){
 const record=await Tiempo.findById(id);if(!record)throw new HttpError(404,'Registro no encontrado.');
 const doc=await Importacion.findOneAndUpdate({_id:record.importacionId,versionActiva:record.version,operacion:null,estado:{$in:ACTIVE}},{$set:{operacion:{tipo:'editar'}}},{returnDocument:'after'});
 if(!doc)throw new HttpError(409,'El reporte cambió o está ocupado. Actualiza la vista.');
 try{
  if(!record.modificadoManualmente)record.valoresOriginales=Object.fromEntries([...EDITABLE,'totalAdeudo'].map(key=>[key,record[key]]));
  Object.assign(record,values);recalculateMetrics(record);record.modificadoManualmente=true;record.fechaModificacionManual=new Date();record.modificadoPor=user._id;await record.save();return record;
 }finally{await Importacion.updateOne({_id:doc._id},{$set:{operacion:null}});}
}
export async function report(id){
 for(let attempt=0;attempt<3;attempt++){
  const doc=await activeImport(id);const records=await Tiempo.find({importacionId:id,version:doc.versionActiva}).select('-datosOrigen -version').sort({nombreAsesor:1,_id:1}).lean();
  if(await Importacion.exists({_id:id,versionActiva:doc.versionActiva,estado:{$in:ACTIVE}}))return {importacion:publicImport(doc),registros:records};
 }
 throw new HttpError(409,'El reporte está cambiando. Intenta de nuevo.');
}
