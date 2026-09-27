import {useState} from 'react';
import Modal from './Modal.jsx';
import {importExcel} from '../../services/asesoresApi.js';
const labels={campana:'Campaña',nombreAsesor:'Nombre asesor',jornada:'Jornada',tiempoBreak:'Tiempo break',horario:'Horario',estatus:'Estatus (opcional)'};
export default function ImportExcel({onClose,onImported}) {
  const [files,setFiles]=useState([]),[index,setIndex]=useState(0),[preview,setPreview]=useState(null),[settings,setSettings]=useState({}),[busy,setBusy]=useState(false),[error,setError]=useState(''),[results,setResults]=useState([]),[done,setDone]=useState(false);
  async function inspect(file,options={}) {
    setBusy(true);setError('');setPreview(null);
    try {const {data}=await importExcel(file,options,true);setPreview(data);setSettings({sheet:data.sheet,headerRow:data.headerRow,mapping:data.mapping,jornadaUnit:'auto',breakUnit:'auto'});}
    catch(error){setError(error.message);}finally{setBusy(false);}
  }
  function select(event) {
    const selected=Array.from(event.target.files||[]);setError('');setResults([]);setDone(false);setPreview(null);setFiles([]);
    if(!selected.length)return;
    if(selected.length>10)return setError('Selecciona hasta 10 archivos a la vez.');
    if(selected.some(file=>!/\.(xlsx|xls)$/i.test(file.name)||file.size>5*1024*1024))return setError('Solo archivos .xlsx o .xls de hasta 5 MB cada uno.');
    setFiles(selected);setIndex(0);void inspect(selected[0]);
  }
  async function commit() {
    setBusy(true);setError('');
    try {
      const result=await importExcel(files[index],settings);setResults(old=>[...old,{...result,name:files[index].name}]);onImported();
      if(index+1<files.length){setIndex(index+1);await inspect(files[index+1]);}else{setDone(true);setPreview(null);}
    }catch(error){setError(error.message);}finally{setBusy(false);}
  }
  const missing=Object.keys(labels).filter(field=>field!=='estatus'&&settings.mapping?.[field]===undefined);
  return <Modal title="Importar Excel" onClose={onClose} busy={busy} wide>
    <p className="muted">Revisa cada archivo antes de importar. Los registros nuevos se suman; los asesores ya registrados en la misma campaña se omiten.</p>
    <label className="file-picker">Seleccionar archivos Excel<input type="file" accept=".xlsx,.xls" multiple disabled={busy} onChange={select}/><small>Hasta 10 archivos · 5 MB por archivo · una petición por archivo</small></label>
    {files.length>0&&!done&&<p className="import-current">Archivo {index+1} de {files.length}: <strong>{files[index].name}</strong></p>}
    {busy&&<p role="status">Procesando archivo…</p>}
    {error&&<p className="notice error" role="alert">{error}</p>}
    {preview&&<>
      <div className="form-pair import-controls"><label>Hoja<select value={settings.sheet} disabled={busy} onChange={event=>inspect(files[index],{sheet:event.target.value})}>{preview.sheets.map(name=><option key={name}>{name}</option>)}</select></label>
      <label>Fila de encabezados<input type="number" min="1" max="100" value={settings.headerRow} disabled={busy} onChange={event=>setSettings({...settings,headerRow:+event.target.value})}/></label></div>
      <button className="button secondary" disabled={busy} onClick={()=>inspect(files[index],{sheet:settings.sheet,headerRow:settings.headerRow})}>Releer encabezados</button>
      <p className="muted">Relaciona tus columnas con los campos del sistema. El orden y los nombres pueden variar.</p>
      <div className="mapping-grid">{Object.entries(labels).map(([field,label])=><label key={field}>{label}<select value={settings.mapping[field]??''} disabled={busy} onChange={event=>{const mapping={...settings.mapping};if(event.target.value==='')delete mapping[field];else mapping[field]=+event.target.value;setSettings({...settings,mapping});}}>
        <option value="">{field==='estatus'?'Usar Activo':'Seleccionar columna'}</option>{preview.columns.map(column=><option key={column.index} value={column.index}>{column.label}</option>)}
      </select></label>)}</div>
      <div className="form-pair import-controls">{[['jornadaUnit','Unidad de jornada'],['breakUnit','Unidad de descanso']].map(([field,label])=><label key={field}>{label}<select value={settings[field]} disabled={busy} onChange={event=>setSettings({...settings,[field]:event.target.value})}><option value="auto">Detectar automáticamente</option><option value="horas">Horas</option><option value="minutos">Minutos</option><option value="excel">Fracción de día de Excel</option></select></label>)}</div>
      <p className="muted small">En automático: jornada numérica en horas; descanso numérico en minutos. Las celdas de hora o fracciones de día del descanso se convierten. Si tu archivo usa otra unidad, selecciónala aquí. Las fórmulas requieren un resultado guardado.</p>
      <div className="table-scroll preview-table" tabIndex="0" role="region" aria-label="Vista previa del Excel"><table><thead><tr><th>Fila</th>{preview.columns.map(column=><th key={column.index}>{column.label}</th>)}</tr></thead><tbody>{preview.sample.map(row=><tr key={row.fila}><td>{row.fila}</td>{row.values.map((value,col)=><td key={col}>{value}</td>)}</tr>)}</tbody></table></div>
      {missing.length>0&&<p className="notice">Faltan columnas: {missing.map(field=>labels[field]).join(', ')}.</p>}
      <div className="modal-actions"><button className="button" disabled={busy||missing.length>0||settings.headerRow!==preview.headerRow} onClick={commit}>{busy?'Importando…':'Importar este archivo'}</button></div>
    </>}
    {results.length>0&&<div className="import-results" aria-live="polite">{results.map((result,i)=><section key={i}><h3>{result.name}</h3><p>{result.message}</p><div className="import-counts"><span>Encontrados <b>{result.total}</b></span><span>Nuevos <b>{result.insertados}</b></span><span>Duplicados <b>{result.duplicados}</b></span><span>Con error <b>{result.errores}</b></span></div>{result.advertencias.map(warning=><p className="muted small" key={warning}>{warning}</p>)}{result.detalles.length>0&&<details><summary>Ver errores por fila</summary><ul>{result.detalles.map(item=><li key={item.fila}>Fila {item.fila}: {item.motivo}</li>)}</ul>{result.detallesTruncados&&<p>Se muestran los primeros 100 errores.</p>}</details>}</section>)}</div>}
    {(done||!preview)&&<div className="modal-actions"><button className="button secondary" onClick={onClose} disabled={busy}>Cerrar</button></div>}
  </Modal>;
}
