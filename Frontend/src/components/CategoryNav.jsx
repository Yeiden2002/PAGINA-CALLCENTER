import { NavLink } from 'react-router-dom';

const categories = ['Branding', 'Illustration', 'Mobile', 'Print', 'Product Design', 'Typography', 'Web Design'];

export default function CategoryNav() {
  return (
    <nav className="category-nav" aria-label="Categorías">
      <NavLink to="/tiempos" className={({ isActive }) => `category category-primary${isActive ? ' active' : ''}`}>Tiempos</NavLink>
      <NavLink to="/asesores" className={({ isActive }) => `category category-link${isActive ? ' active' : ''}`}>Asesores</NavLink>
      {categories.map(category => <span className="category" key={category}>{category}</span>)}
    </nav>
  );
}
