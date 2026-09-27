import Hero from '../components/Hero.jsx';
import SearchBar from '../components/SearchBar.jsx';

const homeCopy = {
  title: 'Organiza y consulta tu información en un solo lugar',
  subtitle: 'Una plataforma diseñada para consultar y administrar información de manera rápida y sencilla.',
};

export default function HomePage() {
  return (
    <>
      <Hero {...homeCopy}>
        <SearchBar />
        <div className="hero-tags" aria-label="Características de la plataforma"><span>Todo más simple:</span><span className="tag">Organización</span><span className="tag">Claridad</span><span className="tag">En un solo lugar</span></div>
      </Hero>
      <section className="content-section home-intro">
        <div><p className="section-kicker">UN PUNTO DE PARTIDA</p><h2>Espacio para lo que viene.</h2></div>
        <p>Estamos preparando tu espacio de trabajo.<br />Comienza por la sección <strong>Tiempos</strong>.</p>
      </section>
    </>
  );
}
