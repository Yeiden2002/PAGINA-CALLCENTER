import {request} from './api.js';
const json = (method, body) => ({method,headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
export const listAsesores=(filters,signal)=>request(`/asesores?${new URLSearchParams(Object.entries(filters).filter(([,value])=>value!==''))}`,{signal});
export const saveAsesor=(id,data)=>request(id?`/asesores/${id}`:'/asesores',json(id?'PUT':'POST',data));
export const changeStatus=(id,estatus)=>request(`/asesores/${id}/estatus`,json('PATCH',{estatus}));
export const deleteAsesor=id=>request(`/asesores/${id}`,{method:'DELETE'});
export function importExcel(file,options={},preview=false) {
  const body=new FormData();body.append('archivo',file);body.append('modo',preview?'vista-previa':'importar');body.append('opciones',JSON.stringify(options));
  return request('/asesores/importar',{method:'POST',body});
}
export async function downloadExcel() {
  const blob=await request('/asesores/exportar',{download:true});
  const url=URL.createObjectURL(blob);const link=document.createElement('a');link.href=url;link.download='ASESORES - HORARIOS.xlsx';document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
