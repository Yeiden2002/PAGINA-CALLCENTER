import {parse} from 'csv-parse/sync';
import XLSX from 'xlsx';
import {HttpError,clean} from '../utils/validation.js';
import {isoDate,seconds,clock} from '../utils/tiempo.js';
export const COLUMNS={name:'Nombre',date:'Fecha',start:'Inicio de Sesión',end:'Cerrado de Sesión',connection:'Total (HH:MM:SS)',pause:'PAUSA HH:MM:SS',retro:'PAUSERETROALIMENTACIONHHMMSS',bath:'PAUSEBAÑO15MINO30MINP/10HHHMMSS',break:'PAUSEBREAKHHMMSS'};
const OPTIONAL={excessRetro:'TIMEEXCEEDEDPAUSERETROALIMENTHHMMSS',excessBath:'TIMEEXCEEDEDPAUSEBAÑO15MINHHMMSS'};
function key(x){return clean(String(x??'')).normalize('NFD').replace(/\p{M}/gu,'').toLowerCase().replace('10hhhmmss','10hhmmss');}
export function parseTiempos(buffer,type){
 let matrix;
 try{
  if(type==='csv'){
   const decoder=new TextDecoder('utf-8',{fatal:true});const source=decoder.decode(buffer);
   if(source.includes('\0'))throw new Error('binary');
   const first=source.split(/\r?\n/)[0];const delimiter=[',',';','\t'].sort((a,b)=>first.split(b).length-first.split(a).length)[0];
   matrix=parse(source,{bom:true,delimiter,skip_empty_lines:true,max_record_size:64000,relax_column_count:false,to:10002});
  }else{
   const book=XLSX.read(buffer,{type:'buffer',cellDates:false,cellNF:true,sheetRows:10002});
   if(book.Workbook?.WBProps?.date1904)throw new HttpError(400,'Convierte el libro al sistema de fechas 1900 antes de importarlo.');
   if(book.SheetNames.length>20)throw new Error('sheets');
   const candidates=[];
   for(const name of book.SheetNames){const sheet=book.Sheets[name];const range=XLSX.utils.decode_range(sheet['!fullref']||sheet['!ref']||'A1');if(range.e.r>10001||range.e.c>99)throw new Error('size');const values=XLSX.utils.sheet_to_json(sheet,{header:1,raw:true,defval:''});if(values.slice(0,100).some(row=>Object.values(COLUMNS).every(header=>row.map(key).includes(key(header)))))candidates.push(values);}
   if(candidates.length!==1)throw new HttpError(400,'Debe existir una sola hoja con los encabezados del reporte de tiempos.');matrix=candidates[0];
  }
 }catch(error){if(error instanceof HttpError)throw error;throw new HttpError(415,'Archivo inválido. CSV debe ser UTF-8 con columnas consistentes.');}
 if(matrix.length>10001)throw new HttpError(413,'Máximo 10,000 filas por archivo.');
 const headerIndex=matrix.slice(0,100).findIndex(row=>Object.values(COLUMNS).every(header=>row.map(key).includes(key(header))));
 if(headerIndex<0)throw new HttpError(400,'Faltan columnas del reporte: '+Object.values(COLUMNS).join(', '));
 const headers=matrix[headerIndex].map(key);if(new Set(headers).size!==headers.length||headers.length>100)throw new HttpError(400,'Encabezados repetidos o demasiadas columnas.');
 const rows=[],errors=[],warnings=[],dates=new Set();let total=0;
 for(let index=headerIndex+1;index<matrix.length;index++){
  const row=matrix[index];if(row.every(v=>String(v??'').trim()===''))continue;total++;
  const get=field=>{
   const value=row[headers.indexOf(key(COLUMNS[field]))];
   if(type!=='csv'&&typeof value==='number'){
    if(['date','start','end'].includes(field)){
     const d=XLSX.SSF.parse_date_code(value);if(!d)return '';
     const date=`${String(d.y).padStart(4,'0')}-${String(d.m).padStart(2,'0')}-${String(d.d).padStart(2,'0')}`;
     return field==='date'?date:`${date} ${String(d.H).padStart(2,'0')}:${String(d.M).padStart(2,'0')}:${String(d.S).padStart(2,'0')}`;
    }
    if(['connection','pause','retro','bath','break'].includes(field)&&value>=0&&value<=1){const n=Math.round(value*86400);return `${Math.floor(n/3600)}:${String(Math.floor(n%3600/60)).padStart(2,'0')}:${String(n%60).padStart(2,'0')}`;}
   }
   return String(value??'').trim();
  };
  try{
   const fecha=isoDate(get('date'));dates.add(fecha);
   const name=clean(get('name'));if(!name||name.length>160)throw new HttpError(400,'Nombre vacío o demasiado largo.');
   const time=field=>{const value=get(field);if(!value)return null;if(!/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(value))throw new HttpError(400,'Fecha/hora de sesión inválida.');isoDate(value.slice(0,10));clock(value.slice(11));return value;};
   const start=time('start'),end=time('end');if((start&&start.slice(0,10)!==fecha)||(start&&end&&(end<start||(+new Date(end.replace(' ','T')+'Z')-+new Date(start.replace(' ','T')+'Z'))>86400000)))throw new HttpError(400,'Sesión fuera de la fecha o duración permitida.');
   if(!start||!end)warnings.push({fila:index+1,nombre:name,motivo:'Sesión sin inicio o cierre: se conservan los tiempos conocidos; la hora faltante se muestra Sin dato.'});
   const durations={};for(const field of ['connection','pause','retro','bath','break'])durations[field]=seconds(get(field)||'00:00:00');
   if(!get('connection'))throw new HttpError(400,'Falta tiempo de conexión.');
   const validation={};for(const [field,header] of Object.entries(OPTIONAL)){const column=headers.indexOf(key(header));if(column<0){validation[field]=null;continue;}try{const value=row[column];if(value===null||value===undefined||String(value).trim()===''){validation[field]=null;continue;}validation[field]=typeof value==='number'&&type!=='csv'?seconds(Math.round(value*86400)):seconds(String(value??'').trim()||'00:00:00');}catch{validation[field]=null;warnings.push({fila:index+1,nombre:name,motivo:`${header}: valor de validación inválido; no se usa para calcular.`});}}
   rows.push({fila:index+1,name,fecha,start,end,...durations,...validation});
  }catch(error){errors.push({fila:index+1,nombre:get('name').slice(0,160),motivo:error.message});}
 }
 if(dates.size!==1)throw new HttpError(400,'El archivo debe corresponder a una única fecha.');
 if(!rows.length)throw new HttpError(400,'El archivo no contiene filas válidas.');
 return {fecha:[...dates][0],rows,errors,warnings,total};
}
