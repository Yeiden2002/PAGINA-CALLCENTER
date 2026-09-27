import {useState} from 'react';
import Modal from './Modal.jsx';
import {saveAsesor} from '../../services/asesoresApi.js';
const initial={campana:'',nombreAsesor:'',jornada:'',tiempoBreak:'',horario:'',estatus:'Activo'};
export default function AsesorForm({asesor,onClose,onSaved}) {
  const [form,setForm]=useState(asesor?Object.fromEntries(Object.keys(initial).map(key=>[key,asesor[key]])):initial);
  const [busy,setBusy]=useState(false),[error,setError]=useState('');
  const change=event=>setForm({...form,[event.target.name]:event.target.value});
  async function submit(event) {
    event.preventDefault();setError('');
    if(!form.campana.trim()||!form.nombreAsesor.trim())return setError('Campaña y nombre no pueden estar vacíos.');
    if(+form.tiempoBreak>=+form.jornada*60)return setError('El descanso debe ser menor que la jornada.');
    const match=form.horario.trim().match(/^(\d{1,2}):([0-5]\d)\s*(?:[Aa]|[-–—])\s*(\d{1,2}):([0-5]\d)$/);
    if(!match||+match[1]>23||+match[3]>23)return setError('Usa un horario de 24 horas: 08:00 A 15:00.');
    setBusy(true);
    try {const result=await saveAsesor(asesor?._id,{...form,jornada:+form.jornada,tiempoBreak:+form.tiempoBreak});onSaved(result.message);}
    catch(error){setError(error.message);}finally{setBusy(false);}
  }
  return <Modal title={asesor?'Editar asesor':'Registrar asesor'} onClose={onClose} busy={busy}>
    <p className="muted">Completa la información del asesor. Todos los campos son obligatorios.</p>
    <form onSubmit={submit} className="asesor-form">
      <label>Campaña<input name="campana" value={form.campana} onChange={change} required maxLength={100} autoFocus /></label>
      <label>Nombre asesor<input name="nombreAsesor" value={form.nombreAsesor} onChange={change} required maxLength={160}/></label>
      <div className="form-pair"><label>Jornada (horas)<input name="jornada" type="number" min="0.25" max="24" step="any" value={form.jornada} onChange={change} required/></label>
      <label>Tiempo break (minutos)<input name="tiempoBreak" type="number" min="0" max="240" step="1" value={form.tiempoBreak} onChange={change} required/></label></div>
      <label>Horario<input name="horario" value={form.horario} onChange={change} required maxLength={60} placeholder="08:00 A 15:00"/><small>Formato de 24 horas. También admite turnos nocturnos.</small></label>
      <label>Estatus<select name="estatus" value={form.estatus} onChange={change}><option>Activo</option><option>Inactivo</option></select></label>
      {error&&<p className="notice error" role="alert">{error}</p>}
      <div className="modal-actions"><button type="button" className="button secondary" disabled={busy} onClick={onClose}>Cancelar</button><button className="button" disabled={busy}>{busy?'Guardando…':'Guardar asesor'}</button></div>
    </form>
  </Modal>;
}
