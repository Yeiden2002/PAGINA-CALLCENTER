import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import {once} from 'node:events';
import {applySecurity} from '../src/middleware/security.js';
test('proxy confía solo en el salto inmediato e ignora IPs antepuestas por el cliente',async()=>{
  process.env.FRONTEND_URL='https://frontend.example';process.env.TRUST_PROXY='render';
  const app=express();applySecurity(app);app.get('/',(req,res)=>res.json({ip:req.ip}));
  const server=app.listen(0,'127.0.0.1');await once(server,'listening');
  try {
    for(const spoof of ['192.0.2.1','192.0.2.2, 192.0.2.3']){
      const response=await fetch(`http://127.0.0.1:${server.address().port}`,{headers:{'X-Forwarded-For':`${spoof}, 198.51.100.10`}});
      assert.equal((await response.json()).ip,'198.51.100.10');
    }
  } finally {await new Promise(resolve=>server.close(resolve));}
});
