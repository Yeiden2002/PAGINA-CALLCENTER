import './config/env.js';
import Usuario from './models/Usuario.js';
import Sesion from './models/Sesion.js';
import Importacion from './models/ImportacionTiempos.js';
import Tiempo from './models/TiempoDiario.js';
import {initializeStorage} from './storage/tiemposStorage.js';
import {recalculateExistingMetrics} from './services/recalculateExistingMetrics.js';
import {recoverOperations} from './services/tiemposService.js';
import Asesor from './models/Asesor.js';
import mongoose from 'mongoose';
import app from './app.js';
import { connectDatabase } from './config/database.js';

const port = Number(process.env.PORT || 3000);
const host = process.env.NODE_ENV === 'production' ? '0.0.0.0' : (process.env.HOST || '127.0.0.1');

let server;
let stopping = false;

async function shutdown(code = 0) {
  if (stopping) return;
  stopping = true;
  const deadline = setTimeout(() => process.exit(1), 10000);
  deadline.unref();
  if (server?.listening) await new Promise(resolve => server.close(resolve));
  await mongoose.disconnect();
  process.exit(code);
}

mongoose.connection.on('error', error => console.error('Error de MongoDB:', error.name));
mongoose.connection.on('disconnected', () => {
  if (!stopping) console.error('MongoDB desconectado. /api/health devolverá 503 mientras no haya conexión.');
});
process.on('SIGINT', () => shutdown());
process.on('SIGTERM', () => shutdown());

try {
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT debe ser un puerto válido');
  initializeStorage();
  await connectDatabase();
  await Promise.all([Asesor,Usuario,Sesion,Importacion,Tiempo].map(model=>model.init()));

  await recoverOperations();
  const recalculated=await recalculateExistingMetrics();
  if(recalculated)console.log(`Tiempos actualizados a reglas v2: ${recalculated}`);
  server = app.listen(port, host, () => console.log(`API disponible en http://localhost:${port}`));
  server.on('error', error => {
    console.error('No se pudo iniciar la API:', error.name);
    void shutdown(1);
  });
} catch (error) {
  console.error('No se pudo iniciar el backend. Comprueba MongoDB y Backend/.env:', error.name);
  await shutdown(1);
}
