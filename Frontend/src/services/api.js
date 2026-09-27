const API_URL = (import.meta.env.VITE_API_URL || '').replace(/\/+$/, '');
export async function request(path, options = {}) {
  if (!API_URL) throw new Error('Falta configurar VITE_API_URL.');
  let response;
  try { response = await fetch(`${API_URL}${path}`, {...options,credentials:'include',headers:{...options.headers,...(options.method && options.method!=='GET'?{'X-EAD-Request':'1'}:{})}}); }
  catch (error) { if (error.name === 'AbortError') throw error; throw new Error('No se pudo conectar con la API. Intenta de nuevo.'); }
  if (options.download && response.ok) return response.blob();
  let data;
  try { data=await response.json(); } catch { throw new Error('La API devolvió una respuesta inválida.'); }
  if (!response.ok || !data.success) {
    if(response.status===401&&!path.startsWith('/auth/login'))window.dispatchEvent(new Event('EAD:unauthorized'));
    const error=new Error(data.message || 'No fue posible completar la solicitud.');error.status=response.status;throw error;
  }
  return data;
}
export async function getHealth(signal) {
  const data=await request('/health',{signal});
  if(data.database!=='connected') throw new Error('Error de conexión');
  return data;
}
