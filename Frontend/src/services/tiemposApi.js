import {request} from './api.js';
const query=filters=>new URLSearchParams(Object.entries(filters).filter(([,value])=>value!==''&&value!==undefined));
export const listImports=(filters,signal)=>request(`/tiempos/importaciones?${query(filters)}`,{signal});
export const getReport=(id,signal)=>request(`/tiempos/importaciones/${id}`,{signal});
export const getHistory=(filters,signal)=>request(`/tiempos/historial?${query(filters)}`,{signal});
export function uploadTimes(file,id){const body=new FormData();body.append('archivo',file);return request(id?`/tiempos/importaciones/${id}/archivo`:'/tiempos/importaciones',{method:id?'PUT':'POST',body});}
export const deleteImport=id=>request(`/tiempos/importaciones/${id}`,{method:'DELETE'});
export const editTime=(id,body)=>request(`/tiempos/registros/${id}`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
export async function downloadTimes(item,original){const blob=await request(`/tiempos/importaciones/${item._id}/${original?'original':'excel'}`,{download:true});const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=original?item.nombreArchivoOriginal:`tiempos-${item.fechaDatos}.xlsx`;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);}
export const duration=value=>value===null||value===undefined?'Sin dato':`${Math.floor(value/3600).toString().padStart(2,'0')}:${Math.floor(value%3600/60).toString().padStart(2,'0')}:${Math.floor(value%60).toString().padStart(2,'0')}`;
export const columns=[['nombreAsesor','NOMBRE ASESOR'],['conexion','CONEXIÓN'],['pausa','PAUSA'],['pausaRetro','PAUSA RETRO'],['inicioJornada','INICIO DE JORNADA'],['finJornada','FIN DE JORNADA'],['adeudoBreak','ADEUDO DE BREAK'],['adeudoBano','ADEUDO DE BAÑO'],['totalAdeudo','TOTAL EN ADEUDO']];

export const displayDate=value=>value?.split('-').reverse().join('/')||'';
