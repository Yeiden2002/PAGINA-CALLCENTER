export default function AsesorFilters({filters,onChange,options}) {
  return <div className="asesor-filters">
    <label className="filter-search">Buscar asesor<input type="search" value={filters.search} placeholder="Nombre o campaña…" maxLength={80} onChange={event=>onChange('search',event.target.value)}/></label>
    <label>Campaña<select value={filters.campana} onChange={event=>onChange('campana',event.target.value)}><option value="">Todas las campañas</option>{options.campanas.map(value=><option key={value}>{value}</option>)}</select></label>
    <label>Estatus<select value={filters.estatus} onChange={event=>onChange('estatus',event.target.value)}><option value="">Todos</option><option>Activo</option><option>Inactivo</option></select></label>
    <label>Jornada<select value={filters.jornada} onChange={event=>onChange('jornada',event.target.value)}><option value="">Todas</option>{options.jornadas.map(value=><option key={value} value={value}>{value} h</option>)}</select></label>
    <button className="button secondary clear-filters" onClick={()=>onChange('reset')}>Limpiar</button>
  </div>;
}
