import test, {mock} from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import mongoose from 'mongoose';
import {S3Client} from '@aws-sdk/client-s3';
import {fakeR2} from './helpers/fake-r2.js';
Object.assign(process.env,{NODE_ENV:'production', STORAGE_PROVIDER:'r2', FRONTEND_URL:'https://frontend.example', TRUST_PROXY:'render', R2_ACCOUNT_ID:'a'.repeat(32), R2_ACCESS_KEY_ID:'synthetic', R2_SECRET_ACCESS_KEY:'synthetic', R2_BUCKET:'synthetic'});
const client=fakeR2();
mock.method(S3Client.prototype,'send',command=>client.send(command));
const {default:app}=await import('../src/app.js');
const {default:Usuario}=await import('../src/models/Usuario.js');
const {default:Asesor}=await import('../src/models/Asesor.js');
const {default:Importacion}=await import('../src/models/ImportacionTiempos.js');
const {default:Tiempo}=await import('../src/models/TiempoDiario.js');
const {hashPassword}=await import('../src/auth/password.js');
const {recoverOperations}=await import('../src/services/tiemposService.js');
const {COLUMNS}=await import('../src/services/tiemposParser.js');
const bytes=Buffer.from(Object.values(COLUMNS).join(',')+'\nPersona ficticia,2026-06-30,2026-06-30 08:00:00,2026-06-30 15:00:00,07:00:00,00:00:00,00:00:00,00:16:00,00:31:00\n');
test('R2 con API real y MongoDB temporal: publicación, errores y recuperación',async t=>{
  await mongoose.connect(`mongodb://127.0.0.1:27017/ead_r2_test_${process.pid}`);
  await Promise.all([Usuario,Asesor,Importacion,Tiempo].map(m=>m.init()));
  const server=app.listen(0,'127.0.0.1');await once(server,'listening');
  const base=`http://127.0.0.1:${server.address().port}/api`;
  const headers={'X-EAD-Request':'1',Origin:'https://frontend.example'};
  const request=(url,options={})=>fetch(base+url,{...options,headers:{...headers,...options.headers}});
  const upload=async(buffer,id)=>{const body=new FormData();body.append('archivo',new Blob([buffer],{type:'text/csv'}),'synthetic.csv');const response=await request('/tiempos/importaciones'+(id?`/${id}/archivo`:''),{method:id?'PUT':'POST',body});return {status:response.status,body:await response.json()};};
  let id,old;
  try {
    await Usuario.create({usuario:'synthetic',passwordHash:await hashPassword('Only-synthetic-tests-2026!')});
    await Asesor.create({nombreAsesor:'Persona ficticia',campana:'Prueba',jornada:7,tiempoBreak:30,horario:'08:00 A 15:00'});
    await t.test('cookie Secure/HttpOnly/SameSite=None y sesión persistida',async()=>{
      const r=await request('/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({usuario:'synthetic',password:'Only-synthetic-tests-2026!'})});
      assert.equal(r.status,200);const cookie=r.headers.get('set-cookie');for(const rule of [/HttpOnly/i,/Secure/i,/SameSite=None/i])assert.match(cookie,rule);
      headers.Cookie=cookie.split(';')[0];assert.equal((await request('/auth/session')).status,200);
    });
    await t.test('CORS y CSRF no confían en Host ni en cabecera antigua',async()=>{
      assert.equal((await request('/health',{headers:{Origin:base.replace('/api','')}})).status,403);
      assert.equal((await request('/auth/logout',{method:'POST',headers:{'X-EAD-Request':''}})).status,403);
      const r=await request('/tiempos/importaciones',{method:'OPTIONS',headers:{'Access-Control-Request-Method':'POST','Access-Control-Request-Headers':'X-EAD-Request'}});
      assert.equal(r.status,204);assert.match(r.headers.get('access-control-allow-headers'),/X-EAD-Request/);
    });
    await t.test('subida fallida no publica; respuesta perdida limpia el objeto preparado',async()=>{
      for(const failure of ['PutObjectCommand','put-after-save']){client.fail=failure;assert.equal((await upload(bytes)).status,503);assert.equal(await Importacion.countDocuments(),0);assert.equal(client.objects.size,0);}client.fail=null;
    });
    await t.test('guardar y descargar mismos bytes por ruta autenticada',async()=>{
      const r=await upload(bytes);assert.equal(r.status,201);id=r.body.data._id;old=await Importacion.findById(id).lean();
      const url=`/tiempos/importaciones/${id}/original`;assert.equal((await request(url,{headers:{Cookie:''}})).status,401);
      const download=await request(url);assert.equal(download.status,200);assert.deepEqual(Buffer.from(await download.arrayBuffer()),bytes);assert.match(download.headers.get('content-disposition'),/attachment/);
    });
    await t.test('reemplazo con fallo de subida conserva revisión y original anteriores',async()=>{
      client.fail='put-after-save';assert.equal((await upload(Buffer.concat([bytes,Buffer.from('\n')]),id)).status,503);client.fail=null;
      const now=await Importacion.findById(id);assert.equal(now.versionActiva,old.versionActiva);assert.equal(client.objects.size,1);assert.ok(client.objects.has(old.nombreArchivoAlmacenado));
    });
    await t.test('limpieza fallida conserva nueva revisión completa y diario; recuperación idempotente',async()=>{
      client.fail='DeleteObjectCommand';assert.equal((await upload(Buffer.concat([bytes,Buffer.from('\n\n')]),id)).status,503);
      const now=await Importacion.findById(id);assert.notEqual(now.versionActiva,old.versionActiva);assert.ok(now.operacion);assert.ok(client.objects.has(now.nombreArchivoAlmacenado));assert.ok(client.objects.has(old.nombreArchivoAlmacenado));
      client.fail=null;await recoverOperations();await recoverOperations();assert.equal((await Importacion.findById(id)).operacion,null);assert.equal(client.objects.size,1);
      const versions=await Tiempo.distinct('version',{importacionId:id});assert.deepEqual(versions,[now.versionActiva]);
    });
    await t.test('eliminación fallida conserva diario y recuperación completa conserva asesores',async()=>{
      client.fail='DeleteObjectCommand';assert.equal((await request(`/tiempos/importaciones/${id}`,{method:'DELETE'})).status,503);assert.equal((await Importacion.findById(id)).estado,'Eliminando');
      client.fail=null;await recoverOperations();assert.equal(await Importacion.countDocuments(),0);assert.equal(await Tiempo.countDocuments(),0);assert.equal(client.objects.size,0);assert.equal(await Asesor.countDocuments(),1);
    });
  } finally {
    client.fail=null;await new Promise(resolve=>server.close(resolve));assert.match(mongoose.connection.name,/^ead_r2_test_\d+$/);await mongoose.connection.dropDatabase();await mongoose.disconnect();mock.restoreAll();
  }
});
