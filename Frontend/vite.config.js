import {defineConfig, loadEnv} from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({command, mode}) => {
  const env=loadEnv(mode, process.cwd(), 'VITE_');
  const api=process.env.VITE_API_URL || env.VITE_API_URL;
  if(command==='build' && api !== '/api') throw new Error('Producción requiere VITE_API_URL=/api y frontend/API en el mismo origen.');
  return {plugins:[react()], server:{port:5173,strictPort:true}};
});
