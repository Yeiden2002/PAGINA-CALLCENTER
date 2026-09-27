import {useEffect,useState} from 'react';
import Hero from '../components/Hero.jsx';
import AsesorFilters from '../components/asesores/AsesorFilters.jsx';
import AsesorTable from '../components/asesores/AsesorTable.jsx';
import AsesorForm from '../components/asesores/AsesorForm.jsx';
import DeleteConfirm from '../components/asesores/DeleteConfirm.jsx';
import ImportExcel from '../components/asesores/ImportExcel.jsx';
import {listAsesores,changeStatus,downloadExcel} from '../services/asesoresApi.js';
import '../styles/asesores.css';
const initial={search:'',campana:'',estatus:'',jornada:''};
export default function AsesoresPage() {
  const [filters,setFilters]=useState(initial),[page,setPage]=useState(1),[version,setVersion]=useState(0);
  const [data,setData]=useState({data:[],pagination:{total:0,pages:0},filters:{campanas:[],jornadas:[]}});
  const [loading,setLoading]=useState(true),[error,setError]=useState(''),[notice,setNotice]=useState(''),[modal,setModal]=useState(null),[downloading,setDownloading]=useState(false),[busyId,setBusyId]=useState(null);
  useEffect(()=>{
    const controller=new AbortController();setLoading(true);setError('');
    const timer=setTimeout(()=>{
      listAsesores({...filters,page,limit:25},controller.signal).then(result=>{
        if(controller.signal.aborted)return;
        if(page>Math.max(1,result.pagination.pages)){setPage(Math.max(1,result.pagination.pages));return;}
        setData(result);
      }).catch(error=>{if(error.name!=='AbortError')setError(error.message);}).finally(()=>{if(!controller.signal.aborted)setLoading(false);});
    },250);
    return()=>{clearTimeout(timer);controller.abort();};
  },[filters,page,version]);
  function filter(key,value){setFilters(key==='reset'?initial:{...filters,[key]:value});setPage(1);}
  function saved(message){setModal(null);setNotice(message);setVersion(value=>value+1);}
  async function toggle(asesor){setBusyId(asesor._id);setNotice('');try{const result=await changeStatus(asesor._id,asesor.estatus==='Activo'?'Inactivo':'Activo');setNotice(result.message);setVersion(value=>value+1);}catch(error){setError(error.message);}finally{setBusyId(null);}}
  async function download(){setDownloading(true);setError('');try{await downloadExcel();setNotice('Excel descargado correctamente.');}catch(error){setError(error.message);}finally{setDownloading(false);}}
  return <div className="asesores-page">
    <Hero title="ASESORES" subtitle="Administra, importa y consulta la plantilla de asesores." eyebrow="PERSONAS QUE HACEN LA DIFERENCIA">
      <div className="hero-actions"><button className="button white" onClick={()=>setModal({type:'form'})}>+ Registrar asesor</button><button className="light-button" onClick={()=>setModal({type:'import'})}>↑ Importar Excel</button><button className="light-button" disabled={downloading} onClick={download}>{downloading?'Descargando archivo…':'↓ Descargar Excel'}</button></div>
    </Hero>
    <section className="asesores-content" aria-label="Gestión de asesores">
      <div className="list-heading"><div><p className="section-kicker">TU EQUIPO, EN UN SOLO LUGAR</p><h2>Plantilla de asesores</h2></div><span className="count-label">{loading?'Consultando…':`${data.pagination.total} ${data.pagination.total===1?'asesor':'asesores'}`}</span></div>
      <AsesorFilters filters={filters} onChange={filter} options={data.filters}/>
      {notice&&<div className="notice success" role="status">{notice}<button aria-label="Cerrar mensaje" onClick={()=>setNotice('')}>×</button></div>}
      {error&&<div className="notice error" role="alert">{error}<button className="text-button" onClick={()=>setVersion(value=>value+1)}>Reintentar</button></div>}
      {loading?<div className="list-placeholder" role="status">Cargando asesores…</div>:error?<div className="list-placeholder">No fue posible cargar o completar la operación. Intenta nuevamente.</div>:data.data.length===0?<div className="list-placeholder"><span aria-hidden="true">◷</span><h3>{Object.values(filters).some(Boolean)?'Sin resultados para estos filtros.':'Sin asesores registrados.'}</h3><p>Registra un asesor o importa tu archivo Excel para comenzar.</p></div>:<AsesorTable rows={data.data} onEdit={asesor=>setModal({type:'form',asesor})} onDelete={asesor=>setModal({type:'delete',asesor})} onStatus={toggle} busyId={busyId}/>}
      <div className="pagination"><span>{data.pagination.total?`Página ${page} de ${Math.max(1,data.pagination.pages)}`:'Sin registros'} · 25 por página</span><div><button className="button secondary" disabled={loading||page<=1} onClick={()=>setPage(page-1)}>← Anterior</button><button className="button secondary" disabled={loading||page>=data.pagination.pages} onClick={()=>setPage(page+1)}>Siguiente →</button></div></div>
    </section>
    {modal?.type==='form'&&<AsesorForm asesor={modal.asesor} onClose={()=>setModal(null)} onSaved={saved}/>}
    {modal?.type==='delete'&&<DeleteConfirm asesor={modal.asesor} onClose={()=>setModal(null)} onDeleted={saved}/>}
    {modal?.type==='import'&&<ImportExcel onClose={()=>setModal(null)} onImported={()=>setVersion(value=>value+1)}/>}
  </div>;
}
