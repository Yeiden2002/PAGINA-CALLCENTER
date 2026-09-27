import {createContext,useContext,useEffect,useState} from 'react';
import {Navigate,Outlet,useLocation} from 'react-router-dom';
import {request} from '../services/api.js';
const AuthContext=createContext(null);
export function AuthProvider({children}){
 const [user,setUser]=useState(null),[loading,setLoading]=useState(true),[error,setError]=useState('');
 async function check(){setLoading(true);setError('');try{setUser((await request('/auth/session')).data);}catch(e){setUser(null);if(e.status!==401)setError(e.message);}finally{setLoading(false);}}
 useEffect(()=>{void check();const expired=()=>setUser(null);window.addEventListener('EAD:unauthorized',expired);return()=>window.removeEventListener('EAD:unauthorized',expired);},[]);
 const login=async(usuario,password)=>{const r=await request('/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({usuario,password})});setUser(r.data);};
 const logout=async()=>{await request('/auth/logout',{method:'POST'});setUser(null);};
 return <AuthContext.Provider value={{user,loading,error,check,login,logout}}>{children}</AuthContext.Provider>;
}
export const useAuth=()=>useContext(AuthContext);
export function ProtectedRoute(){const {user,loading,error,check}=useAuth(),location=useLocation();if(loading)return <div className="list-placeholder" role="status">Comprobando sesión…</div>;if(error)return <div className="notice error" role="alert">{error}<button onClick={check}>Reintentar</button></div>;return user?<Outlet/>:<Navigate to="/login" replace state={{from:location.pathname}}/>;}
