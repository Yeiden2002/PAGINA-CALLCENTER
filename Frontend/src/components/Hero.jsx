import CategoryNav from './CategoryNav.jsx';

export default function Hero({ title, subtitle, eyebrow = 'MENOS RUIDO. MÁS CLARIDAD.', children }) {
  return (
    <section className="hero" aria-labelledby="hero-title">
      <div className="hero-art" aria-hidden="true"><div className="orbit orbit-one" /><div className="orbit orbit-two" /></div>
      <div className="hero-inner">
        <CategoryNav />
        <div className="hero-content">
          <p className="eyebrow"><span />{eyebrow}</p>
          <h1 id="hero-title">{title}</h1>
          <p className="hero-subtitle">{subtitle}</p>
          {children}
        </div>
        <div className="hero-footer"><span>CONEXIONES QUE SIMPLIFICAN TU DÍA</span><span aria-hidden="true">↓</span><span>TU ESPACIO DE TRABAJO</span></div>
      </div>
    </section>
  );
}
