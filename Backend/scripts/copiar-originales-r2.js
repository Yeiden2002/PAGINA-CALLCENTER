import '../src/config/env.js';
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import mongoose from 'mongoose';
import {connectDatabase} from '../src/config/database.js';
import Importacion from '../src/models/ImportacionTiempos.js';
import {createLocalStorage, configuredStorage, storageRoot} from '../src/storage/tiemposStorage.js';
// Copy-only migration. Stop both applications before running. Default is read-only verification.
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
try {
  const args=process.argv.slice(2);
  if (args.some(arg=>!['--apply'].includes(arg))) throw new Error('argument');
  const apply=args.includes('--apply');
  await connectDatabase();
  const docs=await Importacion.find().lean();
  if(docs.some(doc=>doc.operacion || !doc.versionActiva || doc.estado==='Eliminando')) throw new Error('pending');
  const local=createLocalStorage(), remote=configuredStorage({...process.env, STORAGE_PROVIDER:'r2'});
  let copied=0, identical=0, pending=0;
  const names=new Set();
  // Validate the complete active inventory before writing a single object.
  for(const doc of docs) {
    const bytes=await local.read(doc.nombreArchivoAlmacenado);
    if(hash(bytes)!==doc.hashArchivo || bytes.length!==doc.tamanoArchivo) throw new Error('integrity');
    names.add(doc.nombreArchivoAlmacenado);
  }
  const files=await fs.readdir(storageRoot).catch(error=>{if(error.code==='ENOENT'&&!docs.length)return [];throw error;});
  if(files.some(name=>!names.has(name))) throw new Error('extra-files');
  for(const doc of docs) {
    const name=doc.nombreArchivoAlmacenado, bytes=await local.read(name);
    if(await remote.exists(name)) {
      if(hash(await remote.read(name))!==hash(bytes)) throw new Error('remote-conflict');
      identical++;
    } else if(apply) {
      await remote.save(name,bytes);
      if(hash(await remote.read(name))!==hash(bytes)) throw new Error('remote-integrity');
      copied++;
    } else pending++;
  }
  console.log(JSON.stringify({mode:apply?'copy':'verify',imports:docs.length,copied,identical,pending}));
  if(pending)process.exitCode=2;
} catch(error) {
  const messages={argument:'Usa solo --apply para copiar; sin argumentos se verifica.',pending:'Hay operaciones pendientes. Recupéralas con el backend local y vuelve a detenerlo antes de migrar.',integrity:'Falta un original o no coincide con la metadata. No continúes.', 'extra-files':'Hay archivos sin referencia activa. Conserva el respaldo y revisa el inventario antes de migrar.', 'remote-conflict':'Existe una clave R2 con bytes diferentes. No se sobrescribió.', 'remote-integrity':'No se pudo verificar la copia remota.'};
  console.error(messages[error.message] || 'No se completó la copia/verificación. Comprueba configuración, permisos, conectividad y originales. No se eliminaron datos.');
  process.exitCode=1;
} finally { await mongoose.disconnect(); }
