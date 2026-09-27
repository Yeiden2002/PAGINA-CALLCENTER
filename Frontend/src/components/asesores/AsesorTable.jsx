const columns=[
  ['campana','Campaña'],
  ['nombreAsesor','Nombre asesor'],
  ['jornada','Jornada'],
  ['tiempoBreak','Tiempo break'],
  ['horario','Horario'],
  ['estatus','Estatus'],
  ['acciones','Acciones'],
];

export default function AsesorTable({rows,onEdit,onDelete,onStatus,busyId}) {
  return <div className="table-scroll" tabIndex="0" role="region" aria-label="Listado de asesores, desplazable horizontalmente"><table className="asesor-table card-table">
    <thead><tr>{columns.map(([,label])=><th key={label} scope="col">{label}</th>)}</tr></thead>
    <tbody>{rows.map(asesor=><tr key={asesor._id}>
      <td data-label="Campaña"><span className="campaign-label">{asesor.campana}</span></td>
      <td className="name-cell" data-label="Nombre asesor">{asesor.nombreAsesor}</td>
      <td data-label="Jornada">{asesor.jornada} h</td>
      <td data-label="Tiempo break">{asesor.tiempoBreak} min</td>
      <td className="schedule-cell" data-label="Horario">{asesor.horario}</td>
      <td data-label="Estatus"><button className={`status-pill ${asesor.estatus==='Activo'?'is-active':''}`} disabled={busyId===asesor._id} aria-label={`Cambiar estatus de ${asesor.nombreAsesor}, actualmente ${asesor.estatus}`} onClick={()=>onStatus(asesor)}>{asesor.estatus}</button></td>
      <td data-label="Acciones"><div className="row-actions"><button onClick={()=>onEdit(asesor)} aria-label={`Editar ${asesor.nombreAsesor}`}>Editar</button><button className="delete-link" onClick={()=>onDelete(asesor)} aria-label={`Eliminar ${asesor.nombreAsesor}`}>Eliminar</button></div></td>
    </tr>)}</tbody>
  </table></div>;
}
