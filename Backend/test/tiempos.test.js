import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {once} from 'node:events';
import {randomUUID,createHash} from 'node:crypto';
import mongoose from 'mongoose';
import XLSX from 'xlsx';
import ExcelJS from 'exceljs';
process.env.TIEMPOS_STORAGE_DIR=await fs.mkdtemp(path.join(os.tmpdir(),'nexo-times-test-'));
const {default:app}=await import('../src/app.js');
const {default:Asesor}=await import('../src/models/Asesor.js');
const {default:Usuario}=await import('../src/models/Usuario.js');
const {default:Importacion}=await import('../src/models/ImportacionTiempos.js');
const {default:Tiempo}=await import('../src/models/TiempoDiario.js');
const {hashPassword}=await import('../src/auth/password.js');
const {parseWorkbook}=await import('../src/services/excelParser.js');
const {parseTiempos,COLUMNS}=await import('../src/services/tiemposParser.js');
const {recoverOperations}=await import('../src/services/tiemposService.js');
const {storedName,saveOriginal,filePath}=await import('../src/storage/tiemposStorage.js');
const {formatSeconds}=await import('../src/utils/tiempo.js');
const fallback=Buffer.from(Object.values(COLUMNS).join(',')+'\nPersona prueba,2026-06-30,2026-06-30 08:00:00,2026-06-30 15:00:00,07:00:00,00:00:00,00:00:00,00:16:00,00:31:00\n');
test('Tiempos, autenticación e historial en MongoDB aislado',async t=>{
 const db='nexo_tiempos_test_'+Date.now();await mongoose.connect('mongodb://127.0.0.1:27017/'+db);await Promise.all([Asesor,Usuario,Importacion,Tiempo].map(m=>m.init()));
 const server=app.listen(0,'127.0.0.1');await once(server,'listening');const base=`http://127.0.0.1:${server.address().port}/api`;
 let auth={};const raw=(route,options={})=>fetch(base+route,{...options,headers:{...auth,...options.headers}});
 const api=async(route,method='GET',body)=>{const r=await raw(route,{method,...(body===undefined?{}:{headers:{'Content-Type':'application/json'},body:JSON.stringify(body)})});return {status:r.status,body:await r.json()};};
 const upload=async(buffer,name='diario.csv',id)=>{const body=new FormData();body.append('archivo',new Blob([buffer],{type:name.endsWith('.csv')?'text/csv':name.endsWith('.xls')?'application/vnd.ms-excel':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}),name);const r=await raw('/tiempos/importaciones'+(id?`/${id}/archivo`:''),{method:id?'PUT':'POST',body});return {status:r.status,body:await r.json()};};
 const source=process.env.TEST_CSV_PATH?await fs.readFile(process.env.TEST_CSV_PATH):fallback;
 let first,record,advisor,advisorsBefore;
 try{
  await t.test('rutas privadas 401 y acceso válido con cookie HttpOnly',async()=>{
   for(const route of ['/tiempos/importaciones','/asesores','/tiempos/importaciones/000000000000000000000000/original'])assert.equal((await api(route)).status,401);
   assert.equal((await api('/tiempos/importaciones/000000000000000000000000','DELETE')).status,401);
   const hashed=await hashPassword('Temporary-testing-2026!');assert.notEqual(hashed,'Temporary-testing-2026!');await Usuario.create({usuario:'tester',passwordHash:hashed});
   assert.equal((await api('/auth/login','POST',{usuario:'tester',password:'Temporary-testing-2026!'})).status,403);
   auth={'X-EAD-Request':'1'};assert.equal((await api('/auth/login','POST',{usuario:'tester',password:'bad'})).status,401);
   const response=await raw('/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({usuario:'tester',password:'Temporary-testing-2026!'})});assert.equal(response.status,200);assert.match(response.headers.get('set-cookie'),/HttpOnly/);assert.match(response.headers.get('set-cookie'),/SameSite=Strict/i);auth.Cookie=response.headers.get('set-cookie').split(';')[0];assert.equal((await api('/auth/session')).status,200);
  });
  await t.test('archivo real: estructura, vínculo con plantilla y guardado físico',async()=>{
   if(process.env.TEST_EXCEL_PATH){const parsed=parseWorkbook(await fs.readFile(process.env.TEST_EXCEL_PATH));for(const row of parsed.rows){const {campanaNormalizada,nombreNormalizado,...data}=row.data;await Asesor.create(data);}}
   else await Asesor.create({nombreAsesor:'Persona prueba',campana:'Pruebas',jornada:7,tiempoBreak:30,horario:'08:00 A 15:00'});
   advisorsBefore=await Asesor.countDocuments();const parsed=parseTiempos(source,'csv');if(process.env.TEST_CSV_PATH){assert.equal(parsed.total,61);assert.equal(parsed.rows.find(r=>r.start==='2026-06-30 10:01:06').connection,18440);}
   const r=await upload(source);assert.equal(r.status,201,JSON.stringify(r.body));first=r.body.data;assert.equal(first.fechaDatos,'2026-06-30');assert.equal(first.registrosEncontrados,parsed.total);assert.equal(await Asesor.countDocuments(),advisorsBefore);
   const stored=await Importacion.findById(first._id);assert.equal(stored.operacion,null);assert.equal(stored.hashArchivo,createHash('sha256').update(source).digest('hex'));assert.deepEqual(await fs.readFile(filePath(stored.nombreArchivoAlmacenado)),source);
   const report=await api('/tiempos/importaciones/'+first._id);assert.equal(report.status,200);assert.ok(report.body.data.registros.length);record=report.body.data.registros.find(r=>r.asesorId&&r.estado==='Identificado');assert.ok(record);advisor=record.asesorId;assert.ok(Number.isInteger(record.pausa));assert.ok(Number.isInteger(record.totalAdeudo));assert.ok(Number.isInteger(record.conexion));assert.equal(record.datosOrigen,undefined);
   if(process.env.TEST_CSV_PATH){const reference=report.body.data.registros.find(r=>r.nombreAsesor===parsed.rows.find(sourceRow=>sourceRow.start==='2026-06-30 10:01:06').name);assert.equal(reference.adeudoBreak,157);}
  });
  await t.test('duplicados por hash/fecha y listado paginado filtrado',async()=>{
   assert.equal((await upload(source,'otro-nombre.csv')).status,409);assert.equal((await upload(Buffer.concat([source,Buffer.from('\n')]))).status,409);
   const r=await api('/tiempos/importaciones?fecha=2026-06-30&nombre=diario&page=1&limit=1');assert.equal(r.body.pagination.total,1);assert.equal(r.body.data[0].nombreArchivoAlmacenado,undefined);
  });
  await t.test('descargar original byte a byte y reporte Excel con estilos',async()=>{
   const r=await raw(`/tiempos/importaciones/${first._id}/original`);assert.equal(r.status,200);assert.deepEqual(Buffer.from(await r.arrayBuffer()),source);
   const ex=await raw(`/tiempos/importaciones/${first._id}/excel`);assert.equal(ex.status,200);const b=Buffer.from(await ex.arrayBuffer());const book=new ExcelJS.Workbook();await book.xlsx.load(b);const sheet=book.worksheets[0];assert.equal(sheet.getCell('A1').value,'30/06/2026');assert.equal(sheet.getCell('A2').value,'NOMBRE ASESOR');assert.equal(sheet.getCell('C3').numFmt,'[h]:mm:ss');assert.notEqual(typeof sheet.getCell('C3').value,'string');assert.equal(sheet.getCell('B3').numFmt,'[h]:mm:ss');assert.equal(sheet.getCell('C2').fill.fgColor.argb,'FFF4B183');await fs.writeFile('/private/tmp/nexo-tiempos-verificado.xlsx',b);
  });
  await t.test('edición auditada, campos protegidos y total recalculado',async()=>{
   const r=await api('/tiempos/registros/'+record._id,'PATCH',{conexion:'23:00:00',pausa:'00:05:00'});assert.equal(r.status,200,JSON.stringify(r.body));assert.equal(r.body.data.conexion,82800);assert.equal(r.body.data.modificadoManualmente,true);assert.equal(r.body.data.valoresOriginales.conexion,record.conexion);assert.ok(r.body.data.modificadoPor);assert.equal(r.body.data.totalAdeudo,r.body.data.adeudoJornada+r.body.data.adeudoBreak+r.body.data.adeudoBano);
   assert.equal((await api('/tiempos/registros/'+record._id,'PATCH',{asesorId:advisor})).status,400);assert.equal((await api('/tiempos/registros/'+record._id,'PATCH',{totalAdeudo:3})).status,400);assert.equal((await api('/tiempos/registros/'+record._id,'PATCH',{pausa:'99:00:00'})).status,400);
  });
  await t.test('segunda fecha, filtros día/semana/mes/año/rango y acumulados >24 horas',async()=>{
   const next=Buffer.from(source.toString('utf8').replaceAll('2026-06-30','2026-06-29'));const r=await upload(next,'290626.csv');assert.equal(r.status,201,JSON.stringify(r.body));
   const rows=(await api('/tiempos/importaciones/'+r.body.data._id)).body.data.registros;const target=rows.find(row=>row.asesorId===advisor);await api('/tiempos/registros/'+target._id,'PATCH',{conexion:'23:00:00'});
   for(const tipo of ['dia','semana','mes','ano','rango']){const h=await api(`/tiempos/historial?asesorId=${advisor}&tipo=${tipo}&fecha=2026-06-30&desde=2026-06-29&hasta=2026-06-30`);assert.equal(h.status,200,JSON.stringify(h.body));assert.equal(h.body.data.acumulados.conexion.formato,tipo==='dia'?'23:00:00':'46:00:00');assert.equal(h.body.data.acumulados.totalAdeudo.diasPendientes,0);}
   assert.equal(formatSeconds(49*3600+61),'49:01:01');
  });
  await t.test('reemplazo fallido conserva original, registros y metadata',async()=>{
   const before=await Importacion.findById(first._id).lean();const count=await Tiempo.countDocuments({importacionId:first._id});
   assert.equal((await upload(Buffer.from('invalid'),'bad.csv',first._id)).status,400);assert.equal((await upload(Buffer.from(source.toString('utf8').replaceAll('2026-06-30','2026-07-01')),'fecha.csv',first._id)).status,400);
   const after=await Importacion.findById(first._id).lean();assert.equal(after.versionActiva,before.versionActiva);assert.equal(after.nombreArchivoAlmacenado,before.nombreArchivoAlmacenado);assert.equal(await Tiempo.countDocuments({importacionId:first._id}),count);assert.equal((await Tiempo.findById(record._id)).conexion,82800);
  });
  await t.test('reemplazo válido publica versión completa y elimina versión anterior',async()=>{
   const before=await Importacion.findById(first._id).lean();const r=await upload(source,'reemplazado.csv',first._id);assert.equal(r.status,200,JSON.stringify(r.body));const after=await Importacion.findById(first._id);assert.notEqual(after.versionActiva,before.versionActiva);assert.equal(after.operacion,null);assert.equal(await Tiempo.countDocuments({importacionId:first._id,version:before.versionActiva}),0);await assert.rejects(fs.access(filePath(before.nombreArchivoAlmacenado)));assert.deepEqual(await fs.readFile(filePath(after.nombreArchivoAlmacenado)),source);assert.equal(await Tiempo.findById(record._id),null);
  });
  await t.test('reemplazos concurrentes no dejan revisiones ni archivos huérfanos',async()=>{
   const results=await Promise.all([upload(source,'concurrente-a.csv',first._id),upload(source,'concurrente-b.csv',first._id)]);
   assert.ok(results.some(r=>r.status===200));for(const r of results)assert.ok([200,409].includes(r.status),JSON.stringify(r));
   const current=await Importacion.findById(first._id);assert.equal(await Tiempo.countDocuments({importacionId:first._id,version:{$ne:current.versionActiva}}),0);assert.equal(current.operacion,null);assert.equal((await fs.readdir(process.env.TIEMPOS_STORAGE_DIR)).length,await Importacion.countDocuments());
  });
  await t.test('XLSX/XLS equivalentes y encabezados reordenados',async()=>{
   const parsed=parseTiempos(source,'csv'),row=parsed.rows[0];for(const [type,date] of [['xlsx','2026-07-02'],['biff8','2026-07-03']]){const values=[row.name,date,date+' '+row.start.slice(11),date+' '+row.end.slice(11),formatSeconds(row.connection),formatSeconds(row.pause),formatSeconds(row.retro),formatSeconds(row.bath),formatSeconds(row.break)];const book=XLSX.utils.book_new();XLSX.utils.book_append_sheet(book,XLSX.utils.aoa_to_sheet([['Reporte'],Object.values(COLUMNS).reverse(),values.reverse()]),'Datos');const b=XLSX.write(book,{type:'buffer',bookType:type});const r=await upload(b,type==='biff8'?'tiempos.xls':'tiempos.xlsx');assert.equal(r.status,201,JSON.stringify(r.body));}
  });
  await t.test('fechas y duraciones numéricas nativas de Excel',async()=>{
   const book=XLSX.utils.book_new();XLSX.utils.book_append_sheet(book,XLSX.utils.aoa_to_sheet([Object.values(COLUMNS),['Persona Excel',46203,46203+8/24,46203+15/24,7/24,0,0,16/1440,31/1440]]),'Datos');
   const parsed=parseTiempos(XLSX.write(book,{type:'buffer',bookType:'xlsx'}),'xlsx');assert.equal(parsed.rows[0].connection,25200);assert.equal(parsed.rows[0].start.slice(11),'08:00:00');assert.equal(parsed.rows[0].break,1860);
  });
  await t.test('NoSQL, ObjectId, traversal, MIME, falsos archivos, CSRF y límite de carga',async()=>{
   for(const route of ['/tiempos/importaciones?nombre[$ne]=x','/tiempos/importaciones?fecha=mal','/tiempos/importaciones?limit=1000','/tiempos/importaciones/no-id','/tiempos/historial?asesorId[$ne]=x&fecha=2026-06-30'])assert.equal((await api(route)).status,400,route);
   assert.equal((await raw('/tiempos/importaciones',{headers:{Origin:'https://evil.example'}})).status,403);
   assert.equal((await raw('/tiempos/importaciones/'+first._id,{method:'DELETE',headers:{'X-EAD-Request':''}})).status,403);
   assert.equal((await fetch(base.replace('/api','')+'/storage/tiempos/test.csv')).status,404);assert.equal((await upload(Buffer.from('fake'),'fake.xlsx')).status,415);assert.equal((await upload(Buffer.alloc(5*1024*1024+1))).status,413);assert.throws(()=>filePath('../../etc/passwd'));
  });
  await t.test('recuperación tras interrupción de reemplazo y persistencia al reconectar',async()=>{
   const doc=await Importacion.findById(first._id);const version=randomUUID(),name=storedName('csv');await Importacion.updateOne({_id:doc._id},{$set:{operacion:{tipo:'reemplazar',versionNueva:version,archivoNuevo:name,versionAnterior:doc.versionActiva,archivoAnterior:doc.nombreArchivoAlmacenado}}});await saveOriginal(name,source);const old=await Tiempo.findOne({importacionId:doc._id}).lean();delete old._id;await Tiempo.create({...old,version});
   await mongoose.disconnect();await mongoose.connect('mongodb://127.0.0.1:27017/'+db);await recoverOperations();assert.equal(await Tiempo.countDocuments({importacionId:doc._id,version}),0);await assert.rejects(fs.access(filePath(name)));assert.equal((await Importacion.findById(doc._id)).versionActiva,doc.versionActiva);assert.equal((await api('/auth/session')).status,200);assert.equal((await api('/tiempos/importaciones/'+first._id)).status,200);
  });
  await t.test('eliminar limpia original y registros, conserva asesores, permite reimportar',async()=>{
   const doc=await Importacion.findById(first._id);assert.equal((await api('/tiempos/importaciones/'+first._id,'DELETE')).status,200);assert.equal(await Tiempo.countDocuments({importacionId:first._id}),0);assert.equal(await Importacion.findById(first._id),null);await assert.rejects(fs.access(filePath(doc.nombreArchivoAlmacenado)));assert.equal(await Asesor.countDocuments(),advisorsBefore);assert.equal((await api(`/tiempos/historial?asesorId=${advisor}&tipo=dia&fecha=2026-06-30`)).body.data.dias,0);assert.equal((await upload(source)).status,201);
   const orphan=await Tiempo.aggregate([{$lookup:{from:Importacion.collection.name,localField:'importacionId',foreignField:'_id',as:'i'}},{$match:{i:{$size:0}}},{$count:'n'}]);assert.equal(orphan.length,0);assert.equal((await fs.readdir(process.env.TIEMPOS_STORAGE_DIR)).length,await Importacion.countDocuments());
  });
  await t.test('CSV septiembre persiste resultados, sesiones abiertas, advertencia y Excel actualizado',{skip:!process.env.TEST_SEPTEMBER_CSV_PATH},async()=>{
   if(!process.env.TEST_SEPTEMBER_CSV_PATH)return;
   const bytes=await fs.readFile(process.env.TEST_SEPTEMBER_CSV_PATH);const r=await upload(bytes,'300926.csv');assert.equal(r.status,201,JSON.stringify(r.body));assert.equal(r.body.data.fechaDatos,'2026-09-26');assert.equal(r.body.data.registrosProcesados,30);assert.equal(r.body.data.registrosConError,0);assert.match(r.body.data.advertencias[0],/2026-09-30/);
   const data=(await api('/tiempos/importaciones/'+r.body.data._id)).body.data;const sourceRows=data.registros.filter(r=>r.estado!=='Sin registro');assert.equal(sourceRows.length,30);assert.equal(sourceRows.filter(r=>r.finJornada===null).length,6);for(const row of sourceRows){assert.equal(typeof row.pausa,'number');assert.equal(typeof row.pausaRetro,'number');assert.equal(typeof row.adeudoBano,'number');if(row.asesorId)assert.equal(row.totalAdeudo,row.adeudoJornada+row.adeudoBreak+row.adeudoBano);}
   const stored=await Tiempo.findOne({importacionId:r.body.data._id,pausa:6308,conexion:21751});assert.equal(stored.pausa,6308);assert.equal(stored.conexion,21751);
   const exported=await raw('/tiempos/importaciones/'+r.body.data._id+'/excel');assert.equal(exported.status,200);const b=Buffer.from(await exported.arrayBuffer());await fs.writeFile('/private/tmp/nexo-septiembre-verificado.xlsx',b);const wb=new ExcelJS.Workbook();await wb.xlsx.load(b);assert.equal(wb.worksheets[0].getCell('A1').value,'26/09/2026');for(const sheet of wb.worksheets)sheet.eachRow(row=>row.eachCell(cell=>assert.notEqual(cell.value,'Pendiente')));
  });
  await t.test('actualización histórica v2 conserva originales y correcciones, y es idempotente',async()=>{
   const {recalculateExistingMetrics}=await import('../src/services/recalculateExistingMetrics.js');const fresh=[];for(const date of ['2031-01-02','2031-01-03']){const imported=await upload(Buffer.from(source.toString().replaceAll('2026-06-30',date)));assert.equal(imported.status,201);fresh.push(await Tiempo.findOne({importacionId:imported.body.data._id,estado:'Identificado',modificadoManualmente:false}));}const records=fresh;assert.ok(records.every(Boolean));
   await Tiempo.updateOne({_id:records[0]._id},{$unset:{calculoVersion:1},$set:{pausa:null,pausaRetro:null,totalAdeudo:null}});
   await Tiempo.updateOne({_id:records[1]._id},{$unset:{calculoVersion:1},$set:{modificadoManualmente:true,pausa:888,adeudoBreak:123}});
   assert.equal(await recalculateExistingMetrics(),2);const a=await Tiempo.findById(records[0]._id),b=await Tiempo.findById(records[1]._id);assert.equal(a.calculoAnterior.pausa,null);assert.equal(a.pausa,a.datosOrigen.pause);assert.equal(a.calculoVersion,2);assert.equal(b.pausa,888);assert.equal(b.adeudoBreak,123);assert.equal(b.totalAdeudo,b.adeudoJornada+b.adeudoBreak+b.adeudoBano);assert.equal(await recalculateExistingMetrics(),0);
  });
  await t.test('logout invalida sesión',async()=>{assert.equal((await api('/auth/logout','POST')).status,200);assert.equal((await api('/tiempos/importaciones')).status,401);});
 }finally{await new Promise(resolve=>server.close(resolve));assert.equal(mongoose.connection.name,db);await mongoose.connection.dropDatabase();await mongoose.disconnect();await fs.rm(process.env.TIEMPOS_STORAGE_DIR,{recursive:true,force:true});}
});
