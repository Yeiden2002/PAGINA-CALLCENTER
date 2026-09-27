import {seconds,clock,isoDate,formatSeconds} from '../utils/tiempo.js';
import {HttpError} from '../utils/validation.js';
// Business rule supplied for this stage; one source of truth for the allowance.
export const BANO_PERMITIDO_SECONDS=15*60;
export const CALCULO_VERSION=2;
const known=value=>typeof value==='number'&&Number.isFinite(value)&&Number.isInteger(value)&&value>=0;
export const hhmmssToSeconds=value=>seconds(value,{nullable:true});
export const secondsToHHMMSS=value=>{if(value==null)return 'Sin dato';if(!known(value))throw new HttpError(400,'Duración inválida.');return formatSeconds(value);};
export function normalizeDuration(value,{emptyIsZero=false}={}){if(value===null||value===undefined||value==='')return emptyIsZero?0:null;return seconds(value);}
export function parseTimeFromDateTime(value){if(value==null||value==='')return null;if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(value))throw new HttpError(400,'Fecha/hora de sesión inválida.');isoDate(value.slice(0,10));return clock(value.slice(11));}
export const parseDateTimeTime=parseTimeFromDateTime;
export function parseHorarioInicio(value){if(value==null||value==='')return null;if(typeof value!=='string'||!/^([01]\d|2[0-3]):[0-5]\d A ([01]\d|2[0-3]):[0-5]\d$/.test(value))throw new HttpError(400,'Horario del asesor inválido.');return value.slice(0,5)+':00';}
export function calculateRetardo(real,expected){if(real==null||expected==null)return null;return Math.max(0,seconds(clock(real))-seconds(clock(expected)));}
export function calculateAdeudoBreak(consumed,allowed){return known(consumed)&&known(allowed)?Math.max(0,consumed-allowed):null;}
export function calculateAdeudoBano(consumed,allowed=BANO_PERMITIDO_SECONDS){return calculateAdeudoBreak(consumed,allowed);}
export function calculateAdeudoJornada(worked,expected,late){
 if(!known(worked)||!known(expected))return {diferenciaBruta:null,diferenciaNeta:null,adeudoJornada:null,tiempoAFavor:null};
 const diferenciaBruta=worked-expected;
 // The supplied rule compensates lateness only when the gross difference is positive.
 if(diferenciaBruta>0&&!known(late))return {diferenciaBruta,diferenciaNeta:null,adeudoJornada:null,tiempoAFavor:null};
 const diferenciaNeta=diferenciaBruta>0?diferenciaBruta-late:diferenciaBruta;
 return {diferenciaBruta,diferenciaNeta,adeudoJornada:Math.max(0,-diferenciaNeta),tiempoAFavor:Math.max(0,diferenciaNeta)};
}
export function calculateTotalAdeudo(jornada,breakDebt,bathDebt){return [jornada,breakDebt,bathDebt].every(known)?jornada+breakDebt+bathDebt:null;}
export function recalculateMetrics(record){
 record.totalTrabajado=record.conexion??null;
 record.retardo=calculateRetardo(record.inicioJornada,parseHorarioInicio(record.horarioAsignado));
 Object.assign(record,calculateAdeudoJornada(record.totalTrabajado,record.jornadaSegundos,record.retardo));
 record.totalAdeudo=calculateTotalAdeudo(record.adeudoJornada,record.adeudoBreak,record.adeudoBano);
 record.reglasPendientes=[];record.calculoVersion=CALCULO_VERSION;
 return record;
}
export function processDailyMetrics(row,asesor){
 const data={conexion:row?.connection??null,pausa:row?.pause??null,pausaRetro:row?.retro??null,inicioJornada:row?parseTimeFromDateTime(row.start):null,finJornada:row?parseTimeFromDateTime(row.end):null,
 jornadaSegundos:asesor?Math.round(asesor.jornada*3600):null,horarioAsignado:asesor?.horario??null,breakPermitidoSegundos:asesor?asesor.tiempoBreak*60:null,banoPermitidoSegundos:BANO_PERMITIDO_SECONDS,breakConsumido:row?.break??null,banoConsumido:row?.bath??null,excesoRetro:row?.excessRetro??null,diagnosticos:[]};
 data.adeudoBreak=calculateAdeudoBreak(data.breakConsumido,data.breakPermitidoSegundos);data.adeudoBano=calculateAdeudoBano(data.banoConsumido,data.banoPermitidoSegundos);
 if(row?.excessBath!=null&&data.adeudoBano!==row.excessBath)data.diagnosticos.push(`BAÑO: calculado ${secondsToHHMMSS(data.adeudoBano)}; TIMEEXCEEDED ${secondsToHHMMSS(row.excessBath)}. Se conserva el cálculo de consumo menos 15 minutos.`);
 return recalculateMetrics(data);
}
