import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {once} from 'node:events';
import mongoose from 'mongoose';
import XLSX from 'xlsx';
import ExcelJS from 'exceljs';
import app from '../src/app.js';
import Usuario from '../src/models/Usuario.js';
import {hashPassword} from '../src/auth/password.js';
import Asesor from '../src/models/Asesor.js';
import {parseWorkbook} from '../src/services/excelParser.js';
const H=['CAMPAÑA','NOMBRE ASESOR','JORNADA','TIEMPO BREAK','HORARIO'];
const valid={campana:'Prueba',nombreAsesor:'Persona de prueba',jornada:7,tiempoBreak:30,horario:'08:00 A 15:00',estatus:'Activo'};
function excel(rows,type='xlsx'){const w=XLSX.utils.book_new();XLSX.utils.book_append_sheet(w,XLSX.utils.aoa_to_sheet(rows),'Datos');return XLSX.write(w,{type:'buffer',bookType:type});}
test('CRUD, Excel y seguridad en MongoDB aislado',async t=>{
 await mongoose.connect('mongodb://127.0.0.1:27017/nexo_test_'+Date.now());await Asesor.init();
 const server=app.listen(0,'127.0.0.1');await once(server,'listening');const base=`http://127.0.0.1:${server.address().port}/api`;
 await Usuario.create({usuario:'regression',passwordHash:await hashPassword('Regression-test-2026!')});
 const login=await fetch(base+'/auth/login',{method:'POST',headers:{'Content-Type':'application/json','X-EAD-Request':'1'},body:JSON.stringify({usuario:'regression',password:'Regression-test-2026!'})});
 const authHeaders={Cookie:login.headers.get('set-cookie').split(';')[0],'X-EAD-Request':'1'};
 async function api(path,method='GET',body,headers={}){const r=await fetch(base+path,{method,headers:{...authHeaders,...(body===undefined?{}:{'Content-Type':'application/json'}),...headers},body:body===undefined?undefined:JSON.stringify(body)});return {status:r.status,body:await r.json(),headers:r.headers};}
 async function upload(buffer,name='test.xlsx',options={},preview=false,mime='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'){const body=new FormData();body.append('archivo',new Blob([buffer],{type:mime}),name);body.append('modo',preview?'vista-previa':'importar');body.append('opciones',JSON.stringify(options));const r=await fetch(base+'/asesores/importar',{method:'POST',body,headers:authHeaders});return {status:r.status,body:await r.json()};}
 try{
  await t.test('health, Helmet y CORS',async()=>{const r=await api('/health','GET',undefined,{Origin:'http://localhost:5173'});assert.equal(r.status,200);assert.equal(r.body.database,'connected');assert.equal(r.headers.get('x-content-type-options'),'nosniff');assert.equal(r.headers.get('access-control-allow-origin'),'http://localhost:5173');assert.equal((await api('/health','GET',undefined,{Origin:'https://no.example'})).status,403);});
  let id;
  await t.test('crear, leer, editar y estatus persistentes',async()=>{const r=await api('/asesores','POST',valid);assert.equal(r.status,201);id=r.body.data._id;assert.equal(r.body.data.nombreNormalizado,undefined);assert.equal((await api('/asesores/'+id)).body.data.nombreAsesor,valid.nombreAsesor);assert.equal((await api('/asesores/'+id,'PUT',{...valid,nombreAsesor:'Persona editada'})).status,200);assert.equal((await api('/asesores/'+id+'/estatus','PATCH',{estatus:'Inactivo'})).status,200);assert.equal((await Asesor.findById(id)).estatus,'Inactivo');assert.equal((await api('/asesores?search=editada&campana=Prueba&estatus=Inactivo&jornada=7&limit=1')).body.pagination.total,1);});
  await t.test('duplicado manual, espacios, mayúsculas y concurrencia',async()=>{assert.equal((await api('/asesores','POST',{...valid,nombreAsesor:' PERSONA   EDITADA '})).status,409);const rs=await Promise.all([api('/asesores','POST',{...valid,nombreAsesor:'Carrera'}),api('/asesores','POST',{...valid,nombreAsesor:' carrera '})]);assert.deepEqual(rs.map(r=>r.status).sort(),[201,409]);assert.equal((await api('/asesores','POST',{...valid,campana:'Otra',nombreAsesor:'Carrera'})).status,201);});
  await t.test('ObjectId, campos obligatorios, internos, NoSQL, query, 404 y tamaño JSON',async()=>{
   assert.equal((await api('/asesores/invalido')).status,400);assert.equal((await api('/asesores/000000000000000000000000')).status,404);
   for(const body of [{},{...valid,estatus:'Admin'},{...valid,admin:true},{...valid,campana:{$ne:null}},{...valid,nombreAsesor:['x']},{...valid,_id:id},{...valid,createdAt:'2020'},{...valid,updatedAt:'2020'},{...valid,nombreNormalizado:'otro'},{...valid,horario:'25:00 A 99:00'},{...valid,tiempoBreak:500}])assert.equal((await api('/asesores','POST',body)).status,400);
   for(const q of ['limit=999999','page=0','search[$ne]=x','estatus[$ne]=x','search=a&search=b','unknown=1','search='+encodeURIComponent('a'.repeat(81))])assert.equal((await api('/asesores?'+q)).status,400);
   assert.equal((await api('/asesores?search='+encodeURIComponent('.*'))).body.pagination.total,0);
   assert.equal((await api('/asesores/'+id,'PUT',{...valid,_id:id})).status,400);assert.equal((await api('/asesores/'+id+'/estatus','PATCH',{estatus:'Activo',admin:true})).status,400);
   assert.equal((await api('/asesores','POST',{...valid,nombreAsesor:'x'.repeat(40000)})).status,413);const r=await api('/inexistente');assert.equal(r.status,404);assert.equal(r.body.stack,undefined);
  });
  await t.test('eliminar solo el ID indicado',async()=>{assert.equal((await api('/asesores/'+id,'DELETE')).status,200);assert.equal(await Asesor.findById(id),null);assert.equal((await api('/asesores/'+id,'DELETE')).status,404);});
  await t.test('Excel real, caché de fórmulas y segunda importación sin duplicar',{skip:!process.env.TEST_EXCEL_PATH},async()=>{
   if(!process.env.TEST_EXCEL_PATH){t.diagnostic('Define TEST_EXCEL_PATH para probar el Excel privado de referencia.');return;}
   const b=await fs.readFile(process.env.TEST_EXCEL_PATH);const p=parseWorkbook(b);assert.equal(p.total,56);assert.equal(p.errors.length,0);assert.equal(p.rows[0].data.tiempoBreak,20);
   const first=await upload(b);assert.equal(first.status,200,JSON.stringify(first.body));assert.equal(first.body.insertados,56);assert.equal(first.body.errores,0);const before=await Asesor.countDocuments();const second=await upload(b);assert.equal(second.body.insertados,0);assert.equal(second.body.duplicados,56);assert.equal(await Asesor.countDocuments(),before);
   const {campanaNormalizada,nombreNormalizado,...manual}=p.rows[0].data;assert.equal((await api('/asesores','POST',manual)).status,409);
  });
  await t.test('acumulación, duplicados internos/manual→Excel y errores por fila',async()=>{const before=await Asesor.countDocuments();const b=excel([H,['Prueba','Carrera',7,30,'08:00 A 15:00'],['Carga','Nuevo A',5,20,'08:00 A 13:00'],['Carga','Nuevo B',5,20,'08:00 A 13:00'],[' carga ',' NUEVO  A ',5,20,'08:00 A 13:00'],['Carga','Inválido','x',20,'08:00 A 13:00']]);const r=await upload(b);assert.equal(r.body.insertados,2,JSON.stringify(r.body));assert.equal(r.body.duplicados,2);assert.equal(r.body.errores,1);assert.equal(r.body.detalles[0].fila,6);assert.equal(await Asesor.countDocuments(),before+2);});
  await t.test('XLS, encabezados desplazados, alias, reordenamiento, unidades y mapeo',async()=>{
   const b=excel([['Plantilla'],[],['Asesor','Turno','Descanso','Horas','Campaña'],['Otro asesor','22:00 - 05:00','00:30:00','7 horas','Nocturna']],'biff8');const p=await upload(b,'formato.xls',{},true,'application/vnd.ms-excel');assert.equal(p.body.data.headerRow,3);assert.equal(p.body.data.mapping.nombreAsesor,0);const r=await upload(b,'formato.xls',{},false,'application/vnd.ms-excel');assert.equal(r.body.insertados,1,JSON.stringify(r.body));
   const custom=excel([['Equipo','Persona','Duración','Pausa','Entrada y salida'],['Mapeada','Persona mapeada',420,0.5,'08:00 A 15:00']]);const pp=await upload(custom,'manual.xlsx',{},true);assert.equal(pp.body.data.missing.length,5);const mapped=await upload(custom,'manual.xlsx',{headerRow:1,mapping:{campana:0,nombreAsesor:1,jornada:2,tiempoBreak:3,horario:4},jornadaUnit:'minutos',breakUnit:'horas'});assert.equal(mapped.body.insertados,1,JSON.stringify(mapped.body));assert.equal((await Asesor.findOne({campana:'Mapeada'})).tiempoBreak,30);
  });
  await t.test('fórmula sin caché invalida solo su fila',async()=>{const wb=XLSX.utils.book_new(),ws=XLSX.utils.aoa_to_sheet([H,['Fórmula','Sin caché',7,30,'08:00 A 15:00'],['Fórmula','Con valor',7,30,'08:00 A 15:00']]);ws.D2={t:'n',f:'1+1'};XLSX.utils.book_append_sheet(wb,ws,'Datos');const r=await upload(XLSX.write(wb,{type:'buffer',bookType:'xlsx'}));assert.equal(r.body.errores,1,JSON.stringify(r.body));assert.equal(r.body.insertados,1);});
  await t.test('archivos falsos, MIME, extensión, tamaño, múltiples y mapeo inválido',async()=>{assert.equal((await upload(Buffer.from('no soy Excel'))).status,415);assert.equal((await upload(Buffer.alloc(5*1024*1024+1))).status,413);assert.equal((await upload(excel([H]),'bad.txt',{},false,'text/plain')).status,415);assert.equal((await upload(excel([H]),'bad.xlsx',{},false,'text/plain')).status,415);const form=new FormData();form.append('archivo',new Blob([excel([H])]),'a.xlsx');form.append('archivo',new Blob([excel([H])]),'b.xlsx');assert.equal((await fetch(base+'/asesores/importar',{method:'POST',body:form,headers:authHeaders})).status,400);assert.equal((await upload(excel([H]),'a.xlsx',{mapping:{campana:0,nombreAsesor:0}})).status,400);});
  await t.test('exportación completa actual y Formula Injection como texto',async()=>{
   for(const prefix of ['=','+','-','@'])assert.equal((await api('/asesores','POST',{...valid,campana:'Seguridad',nombreAsesor:prefix+'SUM(1,1)'})).status,201);
   const response=await fetch(base+'/asesores/exportar',{headers:authHeaders});assert.equal(response.status,200);const b=Buffer.from(await response.arrayBuffer());const wb=new ExcelJS.Workbook();await wb.xlsx.load(b);const s=wb.worksheets[0];assert.deepEqual(s.getRow(1).values.slice(1),H);assert.equal(s.rowCount-1,await Asesor.countDocuments());assert.equal(s.columnCount,5);let count=0;s.eachRow((row,i)=>{if(i===1)return;const c=row.getCell(2);if(/^[=+@-]/.test(String(c.value))){assert.equal(typeof c.value,'string');assert.equal(c.formula,undefined);count++;}});assert.equal(count,4);assert.equal(parseWorkbook(b).errors.length,0);await fs.writeFile('/private/tmp/nexo-export-verificado.xlsx',b);
  });
  await t.test('rate limiting de escritura, importación y general: 429',async()=>{let r;for(let i=0;i<130;i++){r=await api('/asesores','POST',{});if(r.status===429)break;}assert.equal(r.status,429);assert.ok(r.headers.get('ratelimit'));for(let i=0;i<65;i++){r=await upload(Buffer.from('bad'));if(r.status===429)break;}assert.equal(r.status,429);for(let i=0;i<610;i++){r=await api('/health');if(r.status===429)break;}assert.equal(r.status,429);});
 }finally{await new Promise(resolve=>server.close(resolve));assert.match(mongoose.connection.name,/^nexo_test_\d+$/);await mongoose.connection.dropDatabase();await mongoose.disconnect();}
});
