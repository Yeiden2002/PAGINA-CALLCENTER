import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createLocalStorage, createR2Storage, storedName, configuredStorage} from '../src/storage/tiemposStorage.js';
import {fakeR2} from './helpers/fake-r2.js';
for (const kind of ['local','r2']) test(`${kind}: guardar, leer, existencia, no sobrescribir, eliminar idempotente y rutas`, async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(),'ead-storage-'));
  try {
    const store = kind === 'local' ? createLocalStorage(root) : createR2Storage({client:fakeR2(), bucket:'test-only'});
    const name = storedName('csv'), bytes = Buffer.from('synthetic,csv\n');
    assert.equal(await store.exists(name),false);
    await store.save(name,bytes);
    assert.equal(await store.exists(name),true);
    assert.deepEqual(await store.read(name),bytes);
    await assert.rejects(store.save(name,Buffer.from('different')));
    assert.deepEqual(await store.read(name),bytes);
    await assert.rejects(store.read('../private.csv'));
    await store.delete(name); await store.delete(name);
    assert.equal(await store.exists(name),false);
    await assert.rejects(store.read(name),{status:404});
  } finally { await fs.rm(root,{recursive:true,force:true}); }
});
test('R2 errores no se confunden con ausencia y no filtran secretos', async () => {
  const client=fakeR2(), store=createR2Storage({client,bucket:'test-only'}), name=storedName('xlsx');
  for (const [command, action] of [['PutObjectCommand',()=>store.save(name,Buffer.from('x'))],['HeadObjectCommand',()=>store.exists(name)],['GetObjectCommand',()=>store.read(name)],['DeleteObjectCommand',()=>store.delete(name)]]) {
    client.fail=command;
    await assert.rejects(action(),error=>error.status===503 && !error.message.includes('Private'));
  }
});
test('R2 verifica integridad al leer', async () => {
  const client=fakeR2(), store=createR2Storage({client,bucket:'test-only'}), name=storedName('csv');
  await store.save(name,Buffer.from('complete'));
  client.objects.get(name).bytes=Buffer.from('modified');
  await assert.rejects(store.read(name),{status:503});
});
test('producción falla cerrada sin R2; proveedor y endpoint restringidos', () => {
  assert.throws(()=>configuredStorage({NODE_ENV:'production'}));
  assert.throws(()=>configuredStorage({STORAGE_PROVIDER:'other'}));
  assert.throws(()=>configuredStorage({STORAGE_PROVIDER:'r2'}));
  assert.throws(()=>configuredStorage({STORAGE_PROVIDER:'r2',R2_ACCOUNT_ID:'a'.repeat(32),R2_ACCESS_KEY_ID:'fake',R2_SECRET_ACCESS_KEY:'fake',R2_BUCKET:'test',R2_ENDPOINT:'http://attacker.example'}));
});
