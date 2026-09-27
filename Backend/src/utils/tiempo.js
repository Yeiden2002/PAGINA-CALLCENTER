import {HttpError,object} from './validation.js';
export const DURATION_FIELDS=['conexion','pausa','pausaRetro','adeudoBreak','adeudoBano','totalAdeudo'];
export const EDITABLE=['conexion','pausa','pausaRetro','inicioJornada','finJornada','adeudoBreak','adeudoBano'];
export function isoDate(value){
 if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value))throw new HttpError(400,'Fecha inválida. Usa YYYY-MM-DD.');
 const d=new Date(value+'T00:00:00Z');if(!Number.isFinite(+d)||d.toISOString().slice(0,10)!==value||value<'2000-01-01'||value>'2100-12-31')throw new HttpError(400,'Fecha fuera de rango.');return value;
}
export function seconds(value,{nullable=false}={}){
 if(nullable&&(value===null||value===undefined||value===''))return null;
 if(typeof value==='number'&&Number.isInteger(value)&&value>=0&&value<=86400)return value;
 if(typeof value==='string'&&/^\d{1,3}:[0-5]\d:[0-5]\d$/.test(value)){const [h,m,s]=value.split(':').map(Number);const n=h*3600+m*60+s;if(n<=86400)return n;}
 throw new HttpError(400,'Duración inválida; usa HH:mm:ss y máximo 24 horas por día.');
}
export function clock(value){if(value===null)return null;if(typeof value!=='string'||!/^([01]\d|2[0-3]):[0-5]\d:[0-5]\d$/.test(value))throw new HttpError(400,'Hora inválida; usa HH:mm:ss (24 horas).');return value;}
export function formatSeconds(value){if(value===null||value===undefined)return 'Sin dato';return `${Math.floor(value/3600).toString().padStart(2,'0')}:${Math.floor(value%3600/60).toString().padStart(2,'0')}:${Math.floor(value%60).toString().padStart(2,'0')}`;}
export function editInput(body){object(body,EDITABLE);if(!Object.keys(body).length)throw new HttpError(400,'No hay campos para corregir.');const result={};for(const [key,value] of Object.entries(body))result[key]=key.endsWith('Jornada')?clock(value):seconds(value,{nullable:true});return result;}
export function pagination(query){const read=(value,fallback,max)=>{if(value===undefined)return fallback;if(typeof value!=='string'||!/^\d{1,6}$/.test(value)||+value<1||+value>max)throw new HttpError(400,'Paginación inválida.');return +value;};return {page:read(query.page,1,100000),limit:read(query.limit,25,100)};}
export function period(query){
 object(query,['asesorId','tipo','fecha','desde','hasta','page','limit']);
 const type=query.tipo||'dia';let from,to;
 if(type==='rango'){from=isoDate(query.desde);to=isoDate(query.hasta);}else{
  const day=isoDate(query.fecha);const d=new Date(day+'T00:00:00Z');
  if(type==='dia'){from=to=day;}
  else if(type==='semana'){d.setUTCDate(d.getUTCDate()-((d.getUTCDay()+6)%7));from=d.toISOString().slice(0,10);d.setUTCDate(d.getUTCDate()+6);to=d.toISOString().slice(0,10);}
  else if(type==='mes'){from=day.slice(0,7)+'-01';to=new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+1,0)).toISOString().slice(0,10);}
  else if(type==='ano'){from=day.slice(0,4)+'-01-01';to=day.slice(0,4)+'-12-31';}
  else throw new HttpError(400,'Periodo inválido.');
 }
 if(from>to||(+new Date(to)-+new Date(from))/86400000>3660)throw new HttpError(400,'Rango inválido; máximo diez años.');return {desde:from,hasta:to};
}
