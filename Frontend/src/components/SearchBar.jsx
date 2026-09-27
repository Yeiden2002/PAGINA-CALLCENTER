export default function SearchBar() {
  return (
    <div className="search-bar">
      <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 4.5 4.5" /></svg>
      <label className="sr-only" htmlFor="main-search">Buscar (disponible en una próxima etapa)</label>
      <input id="main-search" type="search" placeholder="Buscar..." autoComplete="off" />
    </div>
  );
}
