# Informe de entrega EAD · 27/09/2026

## A. Resultado

Preparación de Render Static Site + Web Service único, Atlas y R2 privado, conservando desarrollo local. No hay despliegue ni migración externa realizados. Logo original del usuario y raíz → login implementados y comprobados en navegador.

## B. Identidad

EAD visible en login, header, títulos, footer y metadata; logo EAD BPO sin editar. X-EAD-Request coordinado en API/CORS/frontend/tests. Cookie nexo_session y prefijos de bases temporales conservados por compatibilidad. Home pasa a /inicio protegido. Una sesión vigente lleva a Tiempos sin pedir credenciales otra vez.

## C. Archivos creados

- `Backend/scripts/copiar-originales-r2.js`
- `Backend/test/helpers/fake-r2.js`
- `Backend/test/r2-integration.test.js`
- `Backend/test/security.test.js`
- `Backend/test/storage.test.js`
- `Frontend/public/ead-logo.png`
- `deploy/INFORME.md`
- `render.yaml`


## D. Archivos modificados

- `.gitignore`
- `Backend/.env.example`
- `Backend/package-lock.json`
- `Backend/package.json`
- `Backend/scripts/crear-usuario.js`
- `Backend/src/app.js`
- `Backend/src/config/database.js`
- `Backend/src/middleware/auth.js`
- `Backend/src/middleware/security.js`
- `Backend/src/routes/authRoutes.js`
- `Backend/src/routes/tiemposRoutes.js`
- `Backend/src/server.js`
- `Backend/test/integration.test.js`
- `Backend/test/metrics.test.js`
- `Backend/test/persistence.test.js`
- `Backend/test/tiempos.test.js`
- `Frontend/index.html`
- `Frontend/src/App.jsx`
- `Frontend/src/auth/AuthContext.jsx`
- `Frontend/src/components/Header.jsx`
- `Frontend/src/components/Layout.jsx`
- `Frontend/src/pages/LoginPage.jsx`
- `Frontend/src/services/api.js`
- `Frontend/src/styles/global.css`
- `Frontend/src/styles/login.css`
- `Frontend/vite.config.js`
- `README.md`
- `deploy/README.md`
- `deploy/backend.env.example`
- `package.json`


## E. Archivos eliminados

- `.dockerignore`
- `Dockerfile`
- `Frontend/.env.production`
- `deploy/nexo.service`
- `deploy/nginx.conf`
- `deploy/package.sh`


Las eliminaciones retiran despliegue VPS Nginx/systemd, empaquetado monolítico y Docker frontend/API juntos. Frontend/.env.production fijaba /api para un único origen y resultaba incompatible con los servicios separados. Se conserva el directorio deploy con la guía y plantilla nuevas. No se borró storage, base de datos ni archivos originales. dist se regeneró y está ignorado.

## F. Paquetes

Se instaló @aws-sdk/client-s3 3.1141.0 (26 paquetes nuevos contando dependencias transitivas), package-lock actualizado. npm informó 0 vulnerabilidades durante instalación. Ninguna dependencia nueva en Frontend.

## G. Variables completas

Desarrollo Backend: NODE_ENV=development, PORT=3000, MONGODB_URI=mongodb://127.0.0.1:27017/asesores_horarios, FRONTEND_URL=http://localhost:5173, TRUST_PROXY=none, STORAGE_PROVIDER=local. Opcionales: TIEMPOS_STORAGE_DIR (ruta absoluta; por defecto Backend/storage/tiempos) y HOST (solo desarrollo; por defecto 127.0.0.1). Frontend: VITE_API_URL=http://localhost:3000/api.

Producción Backend: NODE_VERSION=22.22.0, NODE_ENV=production, TRUST_PROXY=render, STORAGE_PROVIDER=r2, MONGODB_URI=<URI Atlas>, FRONTEND_URL=https://<FRONTEND>.onrender.com, R2_ACCOUNT_ID=<cuenta>, R2_ACCESS_KEY_ID=<clave>, R2_SECRET_ACCESS_KEY=<secreto>, R2_BUCKET=ead-originales. R2_ENDPOINT opcional: https://<ACCOUNT_ID>.r2.cloudflarestorage.com; se deriva por defecto. PORT lo asigna Render, producción fuerza 0.0.0.0. No configurar HOST, TIEMPOS_STORAGE_DIR ni BOOTSTRAP en producción. Frontend: NODE_VERSION=22.22.0 y VITE_API_URL=https://<BACKEND>.onrender.com/api. Ningún secreto VITE.

## H. Atlas

Free/M0, cluster ead-cluster, región AWS Northern Virginia si está disponible. Base asesores_horarios. Usuario ead_app con readWrite limitado a esa base. Autorizar salidas reales de Render y temporalmente IP de administración; no abrir todo Internet. URI mongodb+srv://<DB_USER>:<DB_PASSWORD_URL_ENCODED>@<ATLAS_HOST>/asesores_horarios?retryWrites=true&w=majority. Guardar en Environment del Backend. Pasos detallados: [guía, sección 2](README.md#2-mongodb-atlas).

## I. R2

Bucket ead-originales, Standard, global, público desactivado y sin dominio público/expiración de originales. Token Object Read & Write limitado al bucket. Endpoint https://<ACCOUNT_ID>.r2.cloudflarestorage.com. Copiar las variables R2 de G al Backend. No hace falta CORS de bucket. Ver [sección 3](README.md#3-cloudflare-r2-privado).

## J. Render Backend

Web Service Node, región Virginia, plan Free, una instancia, Auto-Deploy Off. Root Directory Backend; Build Command npm ci --omit=dev; Start Command npm start; Health Check /api/health. Variables en G. No disco persistente, Docker, Shell ni pre-deploy command necesarios. Archivo declarativo render.yaml sin secretos.

## K. Render Frontend

Static Site; Root Directory Frontend; Build Command npm ci && npm run build; Publish Directory dist; NODE_VERSION y VITE_API_URL de G. Rewrite /* → /index.html. Cambiar VITE_API_URL exige recompilar. Compartir raíz del Static Site, que abre login en la misma pestaña.

## L. GitHub

Aún no existe repositorio Git inicializado en esta carpeta ni se hizo push. Preparar repo privado, git init, agregar código/docs/lockfiles/logo autorizado, revisar staging y luego commit/push con autenticación normal, sin tokens en remote. .gitignore excluye .env.*, originales, hojas reales, node_modules, dist, backups, dumps, logs y claves; incluye .env.example. El escaneo de candidatos no encontró patrones de credenciales, valores secretos locales ni nombres exactos de los CSV privados. No sustituye revisar un eventual historial anterior. Comandos en [sección 1](README.md#1-preparar-github).

## M. Migración

No ejecutada. Congelar escrituras y detener ambos backends, respaldar MongoDB + todos los originales fuera de Git, restaurar en Atlas vacío sin --drop, copiar con scripts/copiar-originales-r2.js --apply y luego verificar sin --apply. La herramienta conserva UUIDs, comprueba SHA-256/tamaño y no borra ni sobrescribe datos. Primero verificar contra metadata local y después contra Atlas restaurado. Comparar IDs/conteos/auditoría/índices en Compass antes de arrancar y compartir. Respaldo/restauración requieren ambos componentes; R2 activo no es un backup independiente. Atención: binario local 8.3.11 y M0 documentado 8.0; ensayar compatibilidad del restore antes del traslado definitivo. [Procedimiento completo](README.md#7-migración-segura-del-histórico-no-ejecutada).

## N. Pruebas

npm test --prefix Backend: 56 pruebas descubiertas, 51 correctas, 0 fallidas, 5 opcionales omitidas (51 ejecutadas). Con TEST_EXCEL_PATH, TEST_CSV_PATH, TEST_SEPTEMBER_CSV_PATH, TEST_HISTORICAL_JSON_PATH y TEST_MONGOD_PATH: 56 ejecutadas/correctas, 0 fallidas, 0 omitidas. Datos y bases temporales, sin credenciales R2 reales. Se probaron subida/descarga/existencia/borrado, respuesta perdida, fallos de reemplazo, conservación de versión previa, limpieza fallida, recuperación idempotente, autenticación/cookies/CORS/CSRF/IP y regresión existente. Reinicio real de procesos usa storage local; R2 se probó mediante cliente S3 simulado. No hubo ensayo cloud real.

## O. Build

npm run build --prefix Frontend correcto, Vite 8.3.1, 49 módulos, salida dist. Login y logo comprobados en navegador abriendo http://localhost:5173/, que queda en /login. Backend local /api/health devuelve success=true, database=connected. processMetrics, parsers y tiemposService conservan su contenido; no se alteraron fórmulas.

## P. Seguridad y límites operativos

R2 privado mediante API autenticada; nombres UUID validados, subida condicional, SHA-256 y timeout. Fail-fast si producción no usa R2. CORS explícito, cookies HttpOnly/Secure/SameSite=None en producción, Strict en desarrollo, CSRF y rate limits preservados. Logs de arranque sin mensajes que puedan revelar URI. Alta exclusivamente por CLI interactiva; no usuario/contraseña predeterminados.

Pendiente validar ingreso real Render e IP desde dos redes. Los navegadores que bloquean cookies de terceros pueden impedir sesiones entre los dominios gratuitos: la guía explica la limitación y transición posterior a subdominios propios sin cambiar arquitectura. No se ha demostrado compatibilidad con todos los navegadores.

Render solapa versiones al desplegar: Auto-Deploy está desactivado y la guía exige parar completamente la instancia vieja antes de arrancar/recuperar la nueva. Si el panel no permite desplegar suspendido, usar un servicio sustituto manteniendo el anterior suspendido y actualizar las URLs. No hacer Restart Service mientras el viejo atiende tráfico ni previews contra la misma base/bucket. La implementación no ofrece coordinación multiinstancia ni transacción distribuida.

## Q. Costos

Render gratuito: 750 horas/mes por workspace, suspensión tras 15 minutos sin tráfico, sin Shell/disco/escalamiento; revisar cuotas de bandwidth/build en Billing y posible suspensión/cobro al exceder. Render desaconseja Free para producción crítica. Atlas M0: aproximadamente 512 MB, sin backups automáticos, límites de conexiones/operaciones/transferencia. R2 Standard: 10 GB-mes + 1 millón operaciones A + 10 millones B gratis al mes; excedentes facturables, salida directa gratuita. No se contrataron servicios ni dominio. Fuentes consultadas: [Render](https://render.com/docs/free), [Atlas](https://www.mongodb.com/docs/atlas/reference/free-shared-limitations/), [R2](https://developers.cloudflare.com/r2/pricing/).

## R. Pasos manuales pendientes, en orden

1. Revisar código y staging; crear GitHub privado y subir sin datos/secretos.
2. Crear Atlas Free, usuario y acceso temporal desde tu IP.
3. Crear R2 privado y credenciales limitadas al bucket.
4. Crear Static Site Render para obtener su URL, sin compartirla aún.
5. Crear/configurar Backend Render, añadir sus salidas a Atlas y mantenerlo suspendido si vas a migrar.
6. Congelar y respaldar datos locales; ensayar restore en destino vacío compatible.
7. Restaurar base, copiar originales a R2 y verificar hashes/conteos/IDs contra ambos inventarios.
8. Establecer URLs definitivas, secretos y variables de producción; iniciar únicamente un Backend.
9. Configurar VITE_API_URL real, compilar Static Site y aplicar rewrite SPA.
10. Usar usuario migrado o crear uno mediante CLI local con archivo de entorno privado de Atlas (Free no tiene Shell).
11. Validar health, login, cookies reales, CORS, IP, importación sintética, descargas, edición, historial, reemplazo y eliminación.
12. Probar parada/arranque completo y conservación de datos; ensayar backup/restore conjunto.
13. Compartir la URL raíz del Static Site cuando las verificaciones anteriores sean correctas.

Commit recomendado (no ejecutado):

`feat: preparar EAD para Render Atlas y R2 con logo y acceso directo al login`
