import {useEffect,useState} from 'react';
import {useAuth} from '../auth/AuthContext.jsx';
import { Link, NavLink } from 'react-router-dom';

export default function Header() {
  const {user,logout}=useAuth();
  const [error,setError]=useState('');
  const [open,setOpen]=useState(false);
  useEffect(()=>{
    document.body.classList.toggle('nav-open',open);
    return()=>document.body.classList.remove('nav-open');
  },[open]);
  useEffect(()=>{
    function onKey(event){if(event.key==='Escape')setOpen(false);}
    window.addEventListener('keydown',onKey);
    return()=>window.removeEventListener('keydown',onKey);
  },[]);
  async function closeSession(){
    setError('');
    try{await logout();setOpen(false);}catch(e){setError(e.message);}
  }
  return (
    <header className="site-header">
      <Link to="/inicio" className="brand" aria-label="EAD, ir al inicio" onClick={()=>setOpen(false)}>
        <img className="header-logo" src="/ead-logo.png" alt="EAD BPO" width="341" height="435"/>
      </Link>
      <button type="button" className="nav-toggle" aria-expanded={open} aria-controls="site-nav" onClick={()=>setOpen(value=>!value)}>
        <span className="sr-only">{open?'Cerrar menú':'Abrir menú'}</span>
        <span aria-hidden="true"/>
      </button>
      {open&&<button type="button" className="nav-backdrop" aria-label="Cerrar menú" onClick={()=>setOpen(false)}/>}
      <nav id="site-nav" className="header-nav" aria-label="Navegación principal">
        <NavLink to="/inicio" end onClick={()=>setOpen(false)}>Inicio</NavLink>
        <NavLink to="/tiempos" onClick={()=>setOpen(false)}>Tiempos</NavLink>
        <NavLink to="/asesores" onClick={()=>setOpen(false)}>Asesores</NavLink>
        <div className="header-session">
          {user
            ?<button className="button secondary" onClick={closeSession}>Cerrar sesión · {user.usuario}</button>
            :<Link to="/login" onClick={()=>setOpen(false)}>Iniciar sesión</Link>}
          {error&&<span role="alert">{error}</span>}
        </div>
      </nav>
    </header>
  );
}
