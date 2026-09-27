import {useState} from 'react';
import Modal from './Modal.jsx';
import {deleteAsesor} from '../../services/asesoresApi.js';
export default function DeleteConfirm({asesor,onClose,onDeleted}) {
  const [busy,setBusy]=useState(false),[error,setError]=useState('');
  async function remove(){setBusy(true);try{const result=await deleteAsesor(asesor._id);onDeleted(result.message);}catch(error){setError(error.message);}finally{setBusy(false);}}
  return <Modal title="Eliminar asesor" onClose={onClose} busy={busy}>
    <p>¿Seguro que deseas eliminar a <strong>{asesor.nombreAsesor}</strong>?</p><p className="muted">Se eliminará su registro de la campaña {asesor.campana}.</p>
    {error&&<p className="notice error" role="alert">{error}</p>}
    <div className="modal-actions"><button className="button secondary" disabled={busy} onClick={onClose}>Cancelar</button><button className="button danger" disabled={busy} onClick={remove}>{busy?'Eliminando…':'Eliminar asesor'}</button></div>
  </Modal>;
}
