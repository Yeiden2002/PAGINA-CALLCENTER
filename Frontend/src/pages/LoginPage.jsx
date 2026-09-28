import {useEffect,useRef,useState} from 'react';
import {Link,Navigate,useNavigate} from 'react-router-dom';
import {useAuth} from '../auth/AuthContext.jsx';
import '../styles/login.css';
function Icon({type}){
 const paths={user:<><circle cx="12" cy="8" r="3.5"/><path d="M5 21v-3a7 7 0 0 1 14 0v3"/></>,lock:<><rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3M12 14v3"/></>,eye:<><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/></>,hidden:<><path d="m3 3 18 18M10.5 5.1 12 5c6.5 0 10 7 10 7a19 19 0 0 1-3 3.8M6.2 6.2A22 22 0 0 0 2 12s3.5 7 10 7a11 11 0 0 0 5.4-1.4"/><path d="M10 10a3 3 0 0 0 4 4"/></>};
 return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[type]}</svg>;
}
export default function LoginPage(){
 const {user,login}=useAuth(),navigate=useNavigate();
 const [usuario,setUsuario]=useState(''),[password,setPassword]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(''),[visible,setVisible]=useState(false);const submitting=useRef(false);
 useEffect(()=>{document.title='Iniciar sesión — EAD';},[]);
 const destination='/';
 if(user)return <Navigate to={destination} replace/>;
 async function submit(e){e.preventDefault();if(submitting.current)return;submitting.current=true;setBusy(true);setError('');try{await login(usuario,password);setPassword('');navigate(destination,{replace:true});}catch(err){setError(err.message);}finally{submitting.current=false;setBusy(false);}}
 return <main className="login-page"><section className="login-panel" aria-labelledby="login-title"><Link to="/" className="brand login-brand" aria-label="EAD, ir al inicio"><img className="login-logo" src="/ead-logo.png" alt="EAD BPO" width="341" height="435"/></Link><h1 id="login-title">Iniciar sesión</h1><p className="login-subtitle">Accede a tu espacio de trabajo.</p><form className="login-form" onSubmit={submit} aria-busy={busy}><label htmlFor="login-usuario">Usuario</label><div className="login-input"><span className="login-input-icon"><Icon type="user"/></span><input id="login-usuario" autoComplete="username" autoCapitalize="none" spellCheck={false} required maxLength={80} value={usuario} disabled={busy} onChange={e=>setUsuario(e.target.value)} aria-describedby={error?'login-error':undefined}/></div><label htmlFor="login-password">Contraseña</label><div className="login-input"><span className="login-input-icon"><Icon type="lock"/></span><input id="login-password" autoComplete="current-password" type={visible?'text':'password'} required maxLength={128} value={password} disabled={busy} onChange={e=>setPassword(e.target.value)} aria-describedby={error?'login-error':undefined}/><button type="button" className="password-toggle" aria-label={visible?'Ocultar contraseña':'Mostrar contraseña'} aria-pressed={visible} disabled={busy} onClick={()=>setVisible(!visible)}><Icon type={visible?'hidden':'eye'}/></button></div>{error&&<p id="login-error" className="login-error" role="alert">{error}</p>}<button className="login-submit" disabled={busy}>{busy?'Iniciando sesión...':'INICIAR SESIÓN'}</button></form><p className="login-help">¿Necesitas acceso? Solicita tu usuario al administrador.</p></section></main>;
}
