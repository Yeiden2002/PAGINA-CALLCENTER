import {Router} from 'express';
import mongoose from 'mongoose';

import ExcelJS from 'exceljs';
import Importacion from '../models/ImportacionTiempos.js';
import Tiempo from '../models/TiempoDiario.js';
import Asesor from '../models/Asesor.js';
import {HttpError,object,text} from '../utils/validation.js';
import {isoDate,pagination,period,DURATION_FIELDS,editInput,formatSeconds} from '../utils/tiempo.js';
import {ACTIVE,publicImport,activeImport,importFile,deleteImport,editRecord,report} from '../services/tiemposService.js';
import {readOriginal} from '../storage/tiemposStorage.js';
import {tiemposUpload} from '../middleware/tiemposUpload.js';
import {importCapacity} from '../middleware/upload.js';
import {importLimiter,writeLimiter,exportLimiter} from '../middleware/rateLimiters.js';
const router=Router();
function id(value){if(typeof value!=='string'||!/^[a-f\d]{24}$/i.test(value))throw new HttpError(400,'Identificador inválido.');return new mongoose.Types.ObjectId(value);}
router.param('id',(req,res,next,value)=>{try{id(value);next();}catch(e){next(e);}});
router.post('/importaciones',importLimiter,importCapacity,tiemposUpload,async(req,res)=>{object(req.query,[]);res.status(201).json({success:true,data:await importFile(req.file,req.auth.user)});});
router.get('/importaciones',async(req,res)=>{
 object(req.query,['page','limit','fecha','nombre']);const {page,limit}=pagination(req.query);const filter={estado:{$in:ACTIVE}};
 if(req.query.fecha)filter.fechaDatos=isoDate(req.query.fecha);
 if(req.query.nombre)filter.nombreArchivoOriginal={$regex:text(req.query.nombre,'Nombre',80).replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),$options:'i'};
 const [data,total]=await Promise.all([Importacion.find(filter).sort({createdAt:-1,_id:-1}).skip((page-1)*limit).limit(limit).lean(),Importacion.countDocuments(filter)]);
 res.json({success:true,data:data.map(publicImport),pagination:{page,limit,total,pages:Math.max(1,Math.ceil(total/limit))}});
});
router.get('/importaciones/:id',async(req,res)=>{object(req.query,[]);res.json({success:true,data:await report(req.params.id)});});
router.put('/importaciones/:id/archivo',importLimiter,importCapacity,tiemposUpload,async(req,res)=>{object(req.query,[]);res.json({success:true,data:await importFile(req.file,req.auth.user,req.params.id)});});
router.delete('/importaciones/:id',writeLimiter,async(req,res)=>{object(req.query,[]);if(req.body&&Object.keys(req.body).length)object(req.body,[]);await deleteImport(req.params.id);res.json({success:true,message:'Importación, registros y archivo eliminados.'});});
router.patch('/registros/:id',writeLimiter,async(req,res)=>{object(req.query,[]);res.json({success:true,data:await editRecord(req.params.id,editInput(req.body),req.auth.user)});});
router.get('/importaciones/:id/original',exportLimiter,async(req,res)=>{
 object(req.query,[]);const doc=await activeImport(req.params.id);const buffer=await readOriginal(doc.nombreArchivoAlmacenado);res.attachment(doc.nombreArchivoOriginal);res.type('application/octet-stream').send(buffer);
});
router.get('/importaciones/:id/excel',exportLimiter,async(req,res)=>{
 object(req.query,[]);const {importacion,registros}=await report(req.params.id);
 const book=new ExcelJS.Workbook();const sheet=book.addWorksheet('Tiempos',{views:[{state:'frozen',ySplit:2,xSplit:1}]});
 sheet.columns=[44,16,16,16,18,18,18,18,18].map(width=>({width}));sheet.mergeCells('A1:I1');sheet.getCell('A1').value=importacion.fechaDatos.split('-').reverse().join('/');sheet.getCell('A1').fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF808080'}};sheet.getCell('A1').font={bold:true,color:{argb:'FFFFFFFF'}};sheet.getCell('A1').alignment={horizontal:'center'};
 const labels=['NOMBRE ASESOR','CONEXIÓN','PAUSA','PAUSA RETRO','INICIO DE JORNADA','FIN DE JORNADA','ADEUDO DE BREAK','ADEUDO DE BAÑO','TOTAL EN ADEUDO'];const header=sheet.addRow(labels);header.height=44;
 header.eachCell((cell,col)=>{cell.fill={type:'pattern',pattern:'solid',fgColor:{argb:col===1?'FFBDD7EE':col===9?'FFFA786C':[3,4,5,6].includes(col)?'FFF4B183':'FF808080'}};cell.font={bold:true,color:{argb:[2,7,8].includes(col)?'FFFFFFFF':'FF000000'}};});
 const keys=['nombreAsesor','conexion','pausa','pausaRetro','inicioJornada','finJornada','adeudoBreak','adeudoBano','totalAdeudo'];
 for(const record of registros){const row=sheet.addRow(keys.map(key=>{if(DURATION_FIELDS.includes(key))return record[key]===null?'Sin dato':record[key]/86400;return record[key]??'—';}));row.height=21;row.eachCell((cell,col)=>{cell.fill={type:'pattern',pattern:'solid',fgColor:{argb:col===1?'FFFFFFFF':col===9&&record.totalAdeudo>0?'FFFFC7CE':'FFD9D9D9'}};cell.font={name:'Calibri',size:11,bold:col===1,color:{argb:col===9&&record.totalAdeudo>0?'FF9C0006':'FF000000'}};if(DURATION_FIELDS.includes(keys[col-1])&&typeof cell.value==='number')cell.numFmt='[h]:mm:ss';});}
 sheet.eachRow((row,index)=>{if(index===1)return;row.eachCell(cell=>{cell.alignment={vertical:'middle',horizontal:cell.col===1?'left':'center',wrapText:index===2};cell.border={top:{style:'thin'},bottom:{style:'thin'},left:{style:'thin'},right:{style:'thin'}};});});
 sheet.autoFilter='A2:I2';
 const notes=book.addWorksheet('Observaciones');notes.columns=[{width:26},{width:95}];notes.addRow(['Campo','Regla aplicada']);notes.addRow(['Conexión / sesión','Valores del archivo original.']);notes.addRow(['Adeudo break','Máximo entre 0 y break registrado menos tiempoBreak del asesor al importar.']);notes.addRow(['Pausa / retro','Consumos directos del archivo; el exceso de retro no se suma al adeudo.']);notes.addRow(['Baño','Máximo entre 0 y baño consumido menos 15 minutos.']);notes.addRow(['Total','Adeudo de jornada + break + baño. Retardo compensa el excedente positivo de jornada.']);notes.addRow(['Sin dato','Falta información real de la sesión o del asesor; no equivale a cero.']);for(const warning of importacion.advertencias||[])notes.addRow(['Advertencia',warning]);notes.addRow(['Ediciones manuales',registros.filter(r=>r.modificadoManualmente).length]);for(const issue of importacion.incidencias)notes.addRow([`Fila ${issue.fila}`,`${issue.nombre}: ${issue.motivo}`]);
 notes.eachRow((row,index)=>{row.height=index===1?24:36;row.eachCell(cell=>{cell.alignment={wrapText:true,vertical:'middle'};cell.font={name:'Calibri',size:11,bold:index===1};if(index===1)cell.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FFBDD7EE'}};});});
 res.attachment(`tiempos-${importacion.fechaDatos}.xlsx`);res.type('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');await book.xlsx.write(res);res.end();
});
router.get('/historial',async(req,res)=>{
 const range=period(req.query),advisorId=id(req.query.asesorId),{page,limit}=pagination(req.query);
 const asesor=await Asesor.findById(advisorId).lean();if(!asesor)throw new HttpError(404,'Asesor no encontrado.');
 const group={_id:null,dias:{$sum:{$cond:[{$eq:['$estado','Sin registro']},0,1]}}};
 for(const field of DURATION_FIELDS){group[field]={$sum:{$ifNull:['$'+field,0]}};group[field+'Pendientes']={$sum:{$cond:[{$eq:[{$ifNull:['$'+field,null]},null]},1,0]}};}
 const [result]=await Tiempo.aggregate([
  {$match:{asesorId:advisorId,fecha:{$gte:range.desde,$lte:range.hasta}}},
  {$lookup:{from:Importacion.collection.name,localField:'importacionId',foreignField:'_id',as:'importacion'}},{$unwind:'$importacion'},
  {$match:{'importacion.estado':{$in:ACTIVE},$expr:{$eq:['$version','$importacion.versionActiva']}}},
  {$facet:{totales:[{$group:group}],detalle:[{$sort:{fecha:1,_id:1}},{$skip:(page-1)*limit},{$limit:limit},{$project:{datosOrigen:0,version:0,importacion:0}}],count:[{$count:'total'}]}}
 ]);
 const totals=result.totales[0]||{dias:0};delete totals._id;const acumulados={};for(const field of DURATION_FIELDS)acumulados[field]={segundos:totals[field]||0,formato:formatSeconds(totals[field]||0),diasPendientes:totals[field+'Pendientes']||0};
 const total=result.count[0]?.total||0;res.json({success:true,data:{asesor,periodo:range,dias:totals.dias,acumulados,detalle:result.detalle},pagination:{page,limit,total,pages:Math.max(1,Math.ceil(total/limit))}});
});
export default router;
