// Disposable visual test environment: never connects to the main database.
import mongoose from 'mongoose';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
process.env.FRONTEND_URL=process.env.BROWSER_TEST_ORIGIN||'http://localhost:5174';
process.env.NODE_ENV='test';
process.env.TIEMPOS_STORAGE_DIR=await fs.mkdtemp(path.join(os.tmpdir(),'nexo-browser-times-'));
const {default:app}=await import('../src/app.js');
const {default:Asesor}=await import('../src/models/Asesor.js');
const {default:Usuario}=await import('../src/models/Usuario.js');
const {default:Importacion}=await import('../src/models/ImportacionTiempos.js');
const {default:Tiempo}=await import('../src/models/TiempoDiario.js');
const {hashPassword}=await import('../src/auth/password.js');
const {parseWorkbook}=await import('../src/services/excelParser.js');
const {importFile}=await import('../src/services/tiemposService.js');
const dbName=`nexo_browser_test_${process.pid}`;
await mongoose.connect(`mongodb://127.0.0.1:27017/${dbName}`);await Promise.all([Asesor,Usuario,Importacion,Tiempo].map(m=>m.init()));
const user=await Usuario.create({usuario:'visualtest',passwordHash:await hashPassword('Visual-only-test-2026!')});
if(process.env.TEST_EXCEL_PATH){for(const row of parseWorkbook(await fs.readFile(process.env.TEST_EXCEL_PATH)).rows){const {campanaNormalizada,nombreNormalizado,...data}=row.data;await Asesor.create(data);}}
if(process.env.TEST_CSV_PATH){const buffer=await fs.readFile(process.env.TEST_CSV_PATH);const result=await importFile({buffer,size:buffer.length,originalname:path.basename(process.env.TEST_CSV_PATH)},user);console.log('Importación visual:',JSON.stringify({filas:result.registrosEncontrados,identificadas:result.registrosCorrectos,noIdentificadas:result.asesoresNoIdentificados,errores:result.registrosConError}));}
const server=app.listen(3001,'127.0.0.1',()=>console.log(`Prueba visual aislada: ${dbName}, puerto 3001`));
async function stop(){await new Promise(resolve=>server.close(resolve));if(mongoose.connection.name===dbName)await mongoose.connection.dropDatabase();await mongoose.disconnect();await fs.rm(process.env.TIEMPOS_STORAGE_DIR,{recursive:true,force:true});process.exit();}
process.on('SIGTERM',stop);process.on('SIGINT',stop);
