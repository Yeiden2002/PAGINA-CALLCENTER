import { useEffect, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import Header from './Header.jsx';
import { getHealth } from '../services/api.js';

export default function Layout() {
  const [apiStatus, setApiStatus] = useState('checking');
  const { pathname } = useLocation();

  useEffect(() => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    let active = true;
    getHealth(controller.signal)
      .then(() => { if (active) setApiStatus('connected'); })
      .catch(() => { if (active) setApiStatus('error'); })
      .finally(() => clearTimeout(timeout));
    return () => { active = false; clearTimeout(timeout); controller.abort(); };
  }, [pathname]);

  useEffect(() => {
    document.title = pathname === '/' ? 'EAD — Tu información, en un solo lugar' : pathname === '/tiempos' ? 'Tiempos — EAD' : pathname === '/login' ? 'Iniciar sesión — EAD' : pathname === '/asesores' ? 'Asesores — EAD' : 'Página no encontrada — EAD';
  }, [pathname]);

  return (
    <>
      <a className="skip-link" href="#main-content">Saltar al contenido</a>
      <Header />
      <main id="main-content"><Outlet /></main>
      <footer className="site-footer">
        <span className="footer-brand">EAD<span> / </span>Un lugar para conectar tu información.</span>
        <span className={`api-status ${apiStatus}`} role="status"><i aria-hidden="true" />{apiStatus === 'connected' ? 'API conectada' : apiStatus === 'error' ? 'Error de conexión' : 'Comprobando conexión…'}</span>
      </footer>
    </>
  );
}
