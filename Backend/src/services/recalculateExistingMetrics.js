import Asesor from '../models/Asesor.js';
import Tiempo from '../models/TiempoDiario.js';
import Importacion from '../models/ImportacionTiempos.js';
import {EDITABLE} from '../utils/tiempo.js';
import {CALCULO_VERSION,processDailyMetrics,recalculateMetrics} from './processMetrics.js';
// Startup-only, resumable migration. Preserve source files, user edits and previous metrics.
export async function recalculateExistingMetrics(){
 let updated=0;const cursor=Tiempo.find({calculoVersion:{$ne:CALCULO_VERSION}}).cursor();
 try{for await(const record of cursor){
  const active=await Importacion.exists({_id:record.importacionId,versionActiva:record.version,estado:{$in:['Procesado','Con observaciones']}});if(!active)continue;
  const master=record.asesorId?await Asesor.findById(record.asesorId).lean():null;
  const source=record.datosOrigen?.name?record.datosOrigen:null;
  const advisor=master?{...master,jornada:record.jornadaSegundos!=null?record.jornadaSegundos/3600:master.jornada,tiempoBreak:record.breakPermitidoSegundos!=null?record.breakPermitidoSegundos/60:master.tiempoBreak}:null;
  const metrics=processDailyMetrics(source,advisor);
  if(record.modificadoManualmente)for(const key of EDITABLE)metrics[key]=record[key]??null;
  recalculateMetrics(metrics);
  const backup=Object.fromEntries([...EDITABLE,'totalAdeudo','reglasPendientes','jornadaSegundos','breakPermitidoSegundos','banoPermitidoSegundos'].map(key=>[key,record[key]??null]));
  if(master)metrics.diagnosticos.push('Recálculo v2: horario tomado de la maestra al actualizar; se conservan jornada y break guardados al importar.');
  await Tiempo.updateOne({_id:record._id,calculoVersion:{$ne:CALCULO_VERSION}},{$set:{...metrics,calculoAnterior:backup}},{runValidators:true});updated++;
 }}finally{await cursor.close();}
 return updated;
}
