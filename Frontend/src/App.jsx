import {Route, Routes, Link, Navigate} from 'react-router-dom';
import {AuthProvider, ProtectedRoute} from './auth/AuthContext.jsx';
import LoginPage from './pages/LoginPage.jsx';
import Layout from './components/Layout.jsx';
import Hero from './components/Hero.jsx';
import HomePage from './pages/HomePage.jsx';
import AsesoresPage from './pages/AsesoresPage.jsx';
import TiemposPage from './pages/TiemposPage.jsx';

export default function App() {
  return <AuthProvider><Routes>
    <Route path="/" element={<Navigate to="/login" replace/>}/>
    <Route path="/login" element={<LoginPage/>}/>
    <Route element={<ProtectedRoute/>}>
      <Route element={<Layout/>}>
        <Route path="/inicio" element={<HomePage/>}/>
        <Route path="/asesores" element={<AsesoresPage/>}/>
        <Route path="/tiempos" element={<TiemposPage/>}/>
        <Route path="*" element={<Hero title="Página no encontrada" subtitle="Esta dirección no está disponible."><Link className="light-button" to="/inicio">Volver al inicio</Link></Hero>}/>
      </Route>
    </Route>
  </Routes></AuthProvider>;
}
