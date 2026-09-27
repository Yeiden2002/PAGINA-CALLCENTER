import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import net from 'node:net';
import {fileURLToPath} from 'node:url';
import mongoose from 'mongoose';
import Usuario from '../src/models/Usuario.js';
import {hashPassword} from '../src/auth/password.js';
import {COLUMNS} from '../src/services/tiemposParser.js';
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function freePort(){const server=net.createServer().listen(0,'127.0.0.1');await once(server,'listening');const port=server.address().port;await new Promise(resolve=>server.close(resolve));return port;}
async function stop(child){if(!child||child.exitCode!==null)return;const done=once(child,'exit');child.kill('SIGTERM');await done;}
test('persistencia al reiniciar procesos reales de Backend y MongoDB aislados',{skip:!process.env.TEST_MONGOD_PATH,timeout:60000},async()=>{
 const temp=await fs.mkdtemp(path.join(os.tmpdir(),'nexo-restart-')),dbPath=path.join(temp,'db');await fs.mkdir(dbPath);const mongoPort=await freePort(),apiPort=await freePort();const uri=`mongodb://127.0.0.1:${mongoPort}/nexo_restart_test`,base=`http://127.0.0.1:${apiPort}/api`;
 let mongo,backend;let log='';
 const startMongo=()=>{mongo=spawn(process.env.TEST_MONGOD_PATH,['--dbpath',dbPath,'--port',String(mongoPort),'--bind_ip','127.0.0.1','--logpath',path.join(temp,'mongo.log')],{stdio:'ignore'});};
 const startBackend=async()=>{backend=spawn(process.execPath,[fileURLToPath(new URL('../src/server.js',import.meta.url))],{env:{...process.env,NODE_ENV:'test',MONGODB_URI:uri,PORT:String(apiPort),TIEMPOS_STORAGE_DIR:path.join(temp,'files')},stdio:['ignore','pipe','pipe']});backend.stdout.on('data',b=>log+=b);backend.stderr.on('data',b=>log+=b);for(let i=0;i<100;i++){try{if((await fetch(base+'/health')).ok)return;}catch{}if(backend.exitCode!==null)throw new Error(log);await pause(100);}throw new Error('Backend no inició: '+log);};
 try{
  startMongo();await mongoose.connect(uri,{serverSelectionTimeoutMS:15000});await Usuario.create({usuario:'restart',passwordHash:await hashPassword('Restart-test-only-2026!')});await mongoose.disconnect();await startBackend();
  const login=await fetch(base+'/auth/login',{method:'POST',headers:{'Content-Type':'application/json','X-EAD-Request':'1'},body:JSON.stringify({usuario:'restart',password:'Restart-test-only-2026!'})});assert.equal(login.status,200);const headers={Cookie:login.headers.get('set-cookie').split(';')[0],'X-EAD-Request':'1'};
  const source=Buffer.from(Object.values(COLUMNS).join(',')+'\nPersona reinicio,2026-06-30,2026-06-30 08:00:00,2026-06-30 15:00:00,07:00:00,00:00:00,00:00:00,00:16:00,00:31:00\n');const body=new FormData();body.append('archivo',new Blob([source],{type:'text/csv'}),'reinicio.csv');const uploaded=await fetch(base+'/tiempos/importaciones',{method:'POST',headers,body});assert.equal(uploaded.status,201);const id=(await uploaded.json()).data._id;
  await stop(backend);await stop(mongo);startMongo();await startBackend();
  const report=await fetch(base+'/tiempos/importaciones/'+id,{headers});assert.equal(report.status,200);const data=(await report.json()).data;assert.equal(data.registros[0].conexion,25200);assert.equal(data.importacion.fechaDatos,'2026-06-30');const original=await fetch(base+`/tiempos/importaciones/${id}/original`,{headers});assert.equal(original.status,200);assert.deepEqual(Buffer.from(await original.arrayBuffer()),source);assert.equal((await fetch(base+'/auth/session',{headers})).status,200);
 }finally{await mongoose.disconnect();await stop(backend);await stop(mongo);await fs.rm(temp,{recursive:true,force:true});}
});
