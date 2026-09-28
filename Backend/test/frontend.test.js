import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import {mkdtemp, writeFile, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {once} from 'node:events';
import {mountFrontend} from '../src/frontend.js';

test('same-origin: SPA, assets, API y rutas desconocidas conservan su respuesta', async()=>{
  const directory=await mkdtemp(join(tmpdir(),'ead-frontend-'));
  await writeFile(join(directory,'index.html'),'<html>EAD fixture</html>');
  await writeFile(join(directory,'app.js'),'// fixture');
  const app=express();
  app.get('/api/health',(req,res)=>res.json({success:true}));
  app.use('/api',(req,res)=>res.status(404).json({success:false}));
  mountFrontend(app,directory);
  const server=app.listen(0,'127.0.0.1'); await once(server,'listening');
  const base=`http://127.0.0.1:${server.address().port}`;
  try {
    const root=await fetch(base,{redirect:'manual'});
    assert.equal(root.status,302);assert.equal(root.headers.get('location'),'/login');
    for(const path of ['/login','/tiempos','/asesores']) {
      const response=await fetch(base+path);
      assert.equal(response.status,200);assert.match(await response.text(),/EAD fixture/);
      assert.equal(response.headers.get('cache-control'),'no-store');
    }
    assert.match(await (await fetch(base+'/app.js')).text(),/fixture/);
    assert.equal((await fetch(base+'/missing.js')).status,404);
    assert.equal((await fetch(base+'/login',{method:'POST'})).status,404);
    assert.deepEqual(await (await fetch(base+'/api/health')).json(),{success:true});
    const missing=await fetch(base+'/api/missing');assert.equal(missing.status,404);
    assert.deepEqual(await missing.json(),{success:false});
    assert.throws(()=>mountFrontend(express(),join(directory,'absent')),/Falta compilar/);
  } finally {await new Promise(resolve=>server.close(resolve));await rm(directory,{recursive:true,force:true});}
});
