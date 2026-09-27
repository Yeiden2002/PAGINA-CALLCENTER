# EAD: despliegue en producción

Estado: código preparado; no se han creado cuentas, contratado servicios, migrado datos ni publicado una URL. Mantener una instancia de Backend. El acceso exige usuario de EAD; compartir el enlace no permite ver datos sin sesión. `/` abre directamente `/login` en la misma pestaña; el inicio anterior queda en `/inicio` protegido.

## 1. Preparar GitHub

Instala Node 22.22.0 (compatible con Vite), npm y Git. Crea un repositorio **privado**, por ejemplo `ead`, sin inicializarlo con archivos remotos. Desde la raíz del proyecto:

```bash
git init
git add .gitignore README.md package.json render.yaml Backend Frontend deploy
git status --short
git diff --cached --stat
git diff --cached --name-only
```

Revisa el contenido antes de confirmar. No debe aparecer `.env`/`.env.production`, `Backend/storage/`, CSV/XLS/XLSX reales, dumps, logs, claves, `node_modules` o `dist`. `.env.example`, `deploy/backend.env.example`, lockfiles y el logo autorizado sí se incluyen. Nunca uses `git add -f` para datos privados. Los passwords literales de los tests son exclusivamente sintéticos; no son usuarios del programa. Los casos con archivos privados se activan por variables de entorno, no se versionan.

```bash
git commit -m "feat: preparar EAD para Render Atlas y R2 con acceso directo al login"
git branch -M main
git remote add origin https://github.com/<TU_USUARIO>/ead.git
git push -u origin main
```

No pongas tokens en la URL del remote. Usa la autenticación habitual de GitHub. Si ya hay historial, inspecciónalo antes de publicarlo: `.gitignore` no retira secretos antiguos; si hubo uno, revócalo y sanea el historial. Estos comandos no se ejecutaron automáticamente.

## 2. MongoDB Atlas

1. Crea una cuenta y un proyecto `EAD`. En Database → Build a Database elige **Free (M0)**, no Flex/M10. Proveedor AWS, región Northern Virginia (`us-east-1`) si aparece disponible, para acercarla al Backend Render Virginia. Nombre sugerido `ead-cluster`. No cargues datos de muestra.
2. Security → Database Access → Add New Database User. Usuario sugerido `ead_app`, contraseña aleatoria exclusiva guardada en tu gestor. Permisos: rol `readWrite` solo para `asesores_horarios` mediante privilegios específicos, no administrador de todo el cluster. La cuenta de Atlas y el usuario de base son distintos; tampoco son el usuario del login EAD.
3. Security → Network Access: añade temporalmente tu IP pública actual para migración/administración. Después añade **todos los rangos de salida que muestre Render para ese servicio**, en Connect → Outbound. No copies IPs inventadas ni abras `0.0.0.0/0`. Si cambias región, revisa esta lista. El acceso de usuarios finales al programa no requiere añadir sus IPs a Atlas.
4. Database → Connect → Drivers → Node.js. Copia el URI y sustituye los placeholders localmente. Conserva TLS, nunca `tlsAllowInvalidCertificates`. Ejemplo:

```dotenv
MONGODB_URI=mongodb+srv://<DB_USER>:<DB_PASSWORD_URL_ENCODED>@<ATLAS_HOST>/asesores_horarios?retryWrites=true&w=majority
```

Codifica caracteres especiales de la contraseña para URI. Guarda el valor en Render → Environment como secreto, nunca en Git ni en `VITE_*`. Mongoose crea colecciones e índices al iniciar; si migras, restaura antes del primer arranque. Conserva nombre de base e IDs. Revisa los índices únicos por campaña/nombre, hash/fecha, usuario/token y TTL de sesiones.

## 3. Cloudflare R2 privado

1. En tu cuenta Cloudflare abre R2 Object Storage. Activa R2, revisando personalmente las condiciones y cualquier requisito de facturación. No se ha activado una cuenta por ti.
2. Create bucket → `ead-originales`, clase **Standard**. Usa ubicación automática/global. Esta configuración implementa el endpoint global; no selecciones jurisdicción EU/FedRAMP con un endpoint diferente sin adaptar y probar su validación.
3. Settings: **Public Development URL desactivada**, sin Custom Domain público. No configures expiración automática de originales ni bucket locks que impidan las eliminaciones del programa. No hace falta CORS en R2: el navegador habla exclusivamente con la API.
4. Manage R2 API Tokens → Create API token. Elige **Object Read & Write**, limitado exclusivamente a `ead-originales`. Necesita GET/HEAD/PUT/DELETE/listado; no concedas administración de toda la cuenta. Guarda Access Key ID y Secret Access Key al crearlos; no es un token Bearer para el SDK S3.
5. Copia Account ID del panel. Endpoint S3: `https://<ACCOUNT_ID>.r2.cloudflarestorage.com`, sin bucket al final. Configura estas variables **solo en Backend**:

```dotenv
STORAGE_PROVIDER=r2
R2_ACCOUNT_ID=<ACCOUNT_ID>
R2_ACCESS_KEY_ID=<ACCESS_KEY_ID>
R2_SECRET_ACCESS_KEY=<SECRET_ACCESS_KEY>
R2_BUCKET=ead-originales
# Opcional; por defecto se deriva de Account ID:
R2_ENDPOINT=https://<ACCOUNT_ID>.r2.cloudflarestorage.com
```

Las claves de objetos son los UUID existentes, sin prefijo. No cambies bucket/proveedor con metadata activa sin copiar y verificar antes todos los originales. No borres archivos desde el panel R2: usa la aplicación para mantener referencias coherentes.

## 4. Backend en Render

New → Web Service → conecta GitHub y selecciona el repo privado. Runtime **Node**, rama `main`, nombre sugerido `ead-api`, región **Virginia**, plan **Free**, una instancia, sin discos y sin escalamiento. Desactiva Auto-Deploy; lee la sección de actualizaciones antes de volver a desplegar.

Valores exactos:

```text
Root Directory: Backend
Build Command: npm ci --omit=dev
Start Command: npm start
Health Check Path: /api/health
Auto-Deploy: Off
```

Variables:

```dotenv
NODE_VERSION=22.22.0
NODE_ENV=production
TRUST_PROXY=render
STORAGE_PROVIDER=r2
MONGODB_URI=<URI_ATLAS_CON_BASE_Y_CREDENCIALES>
FRONTEND_URL=https://<FRONTEND_REAL>.onrender.com
R2_ACCOUNT_ID=<ACCOUNT_ID>
R2_ACCESS_KEY_ID=<ACCESS_KEY_ID>
R2_SECRET_ACCESS_KEY=<SECRET_ACCESS_KEY>
R2_BUCKET=ead-originales
```

`R2_ENDPOINT` es opcional. Render proporciona `PORT`; no fijes HOST=127.0.0.1 ni configures `TIEMPOS_STORAGE_DIR`, `BOOTSTRAP_*` o `TRUST_PROXY_LOOPBACK`. El servidor usa 0.0.0.0 en producción. El plan gratuito no tiene Shell ni pre-deploy command. `npm start` ejecuta `node src/server.js`; el build no conecta MongoDB ni migra datos.

Para configurar las URLs sin adivinarlas, crea primero el Static Site del paso 5 sin distribuir su enlace. Copia su URL real a FRONTEND_URL. El primer build estático puede fallar mientras falte la URL de API: es intencionado. Crea el servicio Backend, copia su URL real a VITE_API_URL y recompila Frontend. Añade las salidas reales de Render a Atlas antes de arrancar Backend. Si vas a migrar el histórico, mantén Backend suspendido hasta completar el paso 7.

## 5. Frontend en Render

New → Static Site → mismo repositorio y rama, nombre sugerido `ead-web`:

```text
Root Directory: Frontend
Build Command: npm ci && npm run build
Publish Directory: dist
Auto-Deploy: Off
```

Variables de build:

```dotenv
NODE_VERSION=22.22.0
VITE_API_URL=https://<BACKEND_REAL>.onrender.com/api
```

No añadas NODE_ENV=production al build de Frontend si eso provoca omitir las devDependencies: Vite las necesita. Ninguna credencial es una variable VITE. La URL se incorpora al JS al compilar: cambiarla exige nuevo build.

Redirects/Rewrites → Add Rule:

```text
Source: /*
Destination: /index.html
Action: Rewrite
```

Así abrir/refrescar `/login`, `/asesores`, `/tiempos` y `/inicio` carga React. `/` redirige a login en React, sin abrir otra pestaña. Comparte la URL del **Static Site**, no la del Web Service. Si ya hay sesión válida, login lleva a Tiempos.

Alternativa declarativa: New → Blueprint → repo → `render.yaml`. Los secretos `sync: false` se introducen manualmente. Las URLs finales pueden tener sufijos si un nombre está ocupado: comprueba ambas y actualiza las variables; no distribuyas el enlace antes. Usa una sola vía (manual o Blueprint), no dupliques servicios. En Free la instancia es única por diseño.

## 6. Sesiones, cookies, CORS y proxy

La API permite solo los orígenes exactos en FRONTEND_URL, sin `/` final, rutas ni `*`. Admite varios separados por comas para una transición controlada. No se confía en Host, X-Forwarded-Host o un origen enviado por el cliente para ampliar la lista.

La cookie histórica `nexo_session` mantiene compatibilidad, no es marca visible. HttpOnly, vida de 8 horas, Path=/api, sin Domain y Secure en producción. En desarrollo usa SameSite=Strict y URLs localhost a ambos lados. En los dominios Render separados usa **SameSite=None; Secure**, `credentials: include` y la cabecera de escrituras `X-EAD-Request: 1`, incluido login/logout, con Origin autorizado. La cabecera antigua ya no sirve; actualizar Frontend y Backend juntos. Las sesiones están en Atlas; logout elimina la sesión, TTL elimina expiradas. No se guardan tokens en localStorage.

Algunos navegadores bloquean todas las cookies de terceros aun con SameSite=None: hay que comprobar el navegador real de los usuarios. Si su política bloquea la cookie entre dominios onrender.com, la autenticación no persistirá. No desactives CSRF ni traslades tokens a localStorage para ocultarlo. Como transición, permitir cookies de esos dos sitios en ese navegador; para eliminar esa dependencia, configurar posteriormente `app.tudominio` y `api.tudominio` bajo un dominio propio HTTPS (solo cambiar variables/orígenes y DNS, recompilar Frontend). No se requiere comprarlo para comenzar; no se garantiza acceso en navegadores que impidan esta configuración.

`TRUST_PROXY=render` confía únicamente en el proxy inmediato (1 salto). IPs antepuestas a X-Forwarded-For por un cliente no cambian la IP elegida. Esta configuración es para ingreso público Render; nunca publicar directamente el puerto Node con esa opción ni añadir proxies intermedios sin revisar. Render documenta tráfico a través de su ingreso y X-Forwarded-For, pero la cadena efectiva debe comprobarse desde dos redes en el despliegue. No aumentar a `true` si los clientes comparten límite; revisar con Render el salto autorizado. En local `TRUST_PROXY=none` ignora cabeceras reenviadas. Rate limits originales, en memoria, se reinician con el proceso; no son datos de negocio.

## 7. Migración segura del histórico (no ejecutada)

Reserva una ventana de mantenimiento. No permitir escrituras simultáneas en local y nube sobre el mismo histórico. No iniciar un Backend nuevo sobre Atlas antes de copiar originales. MongoDB y R2 no forman una transacción distribuida.

1. Deja al Backend local terminar cualquier recuperación pendiente; comprueba `/api/health` y los originales. Detén **solo Backend**, deja MongoDB funcionando. Suspende el Backend de Render. Mantén usuarios fuera hasta finalizar.
2. Crea carpeta de backup **fuera del repo**, en volumen protegido/cifrado. Sustituye la ruta del ejemplo por una propia:

```bash
umask 077
mkdir -p /ruta/privada/ead-respaldo/originales
mongodump --uri='mongodb://127.0.0.1:27017/asesores_horarios' --db=asesores_horarios --archive=/ruta/privada/ead-respaldo/mongo.archive --gzip
cp -p Backend/storage/tiempos/* /ruta/privada/ead-respaldo/originales/
```

Si configuraste TIEMPOS_STORAGE_DIR, copia ese directorio; si está vacío no hay originales que copiar. Conserva copia completa, incluidas referencias pendientes, no limpies presuntos huérfanos a mano. El archivo contiene usuarios/hashes y datos personales: no enviarlo al chat, GitHub ni carpeta pública.

3. Atlas debe tener `asesores_horarios` **vacía**. Con Database Tools compatibles con las versiones origen/destino, crea fuera del repo un archivo privado `atlas-tools.yml` (chmod 600) con `uri: "<URI_ATLAS>"`. `--config` evita exponer la contraseña en el comando/historial. Restaura:

```bash
mongorestore --config=/ruta/privada/atlas-tools.yml --archive=/ruta/privada/ead-respaldo/mongo.archive --gzip --nsInclude='asesores_horarios.*' --stopOnError
```

No usar `--drop`, `--oplogReplay`, `--preserveUUID` ni restaurar `admin`. Se conservan `_id` documentales, metadatos e índices; UUID interno de colección no es un ID usado por EAD. Si el destino no está vacío o hay error, detente: no sobrescribir ni borrar. Crea otro proyecto/cluster limpio para ensayar. Verifica versiones Database Tools/MongoDB antes de migrar entre versiones. En este equipo el binario instalado corresponde a MongoDB 8.3.11, mientras la documentación M0 consultada indica 8.0: antes del traslado definitivo es obligatorio ensayar el restore en un destino vacío, revisar compatibilidad de índices/opciones y comprobar conteos. No se ha validado ese restore externo ni se debe bajar la versión de la base local en su directorio actual.

4. Crea fuera del repo `/ruta/privada/ead-migracion.env`, permisos 600. Configura MONGODB_URI local, STORAGE_PROVIDER=r2, variables R2 y TIEMPOS_STORAGE_DIR apuntando al directorio de originales congelado (o al respaldo). NODE_ENV=development. No modificar Backend/.env existente. Desde Backend, Node 22:

```bash
node --env-file=/ruta/privada/ead-migracion.env scripts/copiar-originales-r2.js
node --env-file=/ruta/privada/ead-migracion.env scripts/copiar-originales-r2.js --apply
node --env-file=/ruta/privada/ead-migracion.env scripts/copiar-originales-r2.js
```

Sin argumentos solo comprueba: salida `pending > 0`, código 2, significa que faltan copias; con `--apply` copia. No borra ni modifica MongoDB/local, no sobrescribe claves existentes. Comprueba todo el inventario activo local contra hash/tamaño, rechaza diarios pendientes y archivos sin referencia, verifica los bytes remotos y conserva exactamente los UUID. Es reanudable: si se corta, repetir compara antes de copiar. La última verificación debe devolver código 0, `pending: 0`, `identical` igual al número de importaciones.

5. En el archivo externo de migración cambia únicamente MONGODB_URI por Atlas y ejecuta de nuevo la verificación **sin --apply** contra los mismos originales. Esto valida que el inventario restaurado apunta a los bytes correctos. Compara en Compass, origen/destino: conteos, IDs de asesores/importaciones/tiempos/usuarios, fechas, referencias, correcciones, valoresOriginales y calculoAnterior. Colecciones: `asesores`, `usuarios`, `sesions`, `importaciontiempos`, `tiempodiarios`. Sesiones expiradas pueden desaparecer por TTL; las cookies locales no pasan al dominio nuevo, por lo que hay que iniciar sesión otra vez. Se preservan hashes de contraseña.
6. Solo cuando ambos inventarios y conteos coincidan, configura Render con Atlas/R2 y arranca una instancia. Recupera operaciones y crea índices; conserva la migración v2 histórica existente e idempotente. No importar otra vez los mismos CSV como sustituto de la migración, pues perdería IDs/auditoría/correcciones. Conserva el respaldo y el entorno local detenido hasta aceptar la migración.

## 8. Primer usuario

Si migraste usuarios existentes, usa esas mismas credenciales de EAD. No crear duplicados. En Free no hay Render Shell: desde tu equipo, con tu IP autorizada temporalmente en Atlas y un archivo privado externo que tenga MONGODB_URI de producción:

```bash
cd Backend
node --env-file=/ruta/privada/ead-admin.env scripts/crear-usuario.js
```

Es el mismo script de `npm run usuario:crear`. Solicita usuario y contraseña oculta de 12–128 caracteres; almacena scrypt con sal. No poner la contraseña en un argumento o variable BOOTSTRAP. Al finalizar retira la IP temporal si ya no necesitas administrar.

En un plan Render de pago con Shell, abre el servicio → Shell → `npm run usuario:crear`; utiliza las variables del servicio. No es necesario contratarlo para crear usuarios. No hay alta pública, roles diferentes ni recuperación automática de contraseñas. Todos los usuarios creados administran asesores y tiempos.

## 9. Verificación antes de compartir

1. Abrir `https://<BACKEND_REAL>.onrender.com/api/health`: HTTP 200, `success:true`, `database:"connected"`; sin sesión `/api/asesores` debe responder 401. Health no accede R2 ni expone bucket/URI.
2. Abrir la URL raíz del Static Site en ventana sin sesión: debe mostrar directamente login con logo EAD BPO. Refrescar `/login`, `/asesores`, `/tiempos`: no deben dar 404 de Render.
3. Probar contraseña errónea, correcta, recarga, logout y sesión cerrada. Comprobar cookie Secure/HttpOnly/SameSite=None en navegador sin copiar su valor ni compartirlo. Verificar navegadores de los usuarios por restricciones de cookies de terceros.
4. Importar un archivo **sintético** de fecha no ocupada, descargar original y comparar bytes, exportar XLSX, editar y comprobar auditoría, historial y reemplazo; eliminar solo esa importación de prueba.
5. En Compass conectar con URI Atlas privado, confirmar documentos/índices. En R2 revisar objeto privado UUID y tamaño, nunca habilitar URL pública. Los tiempos/usuarios no están en Render.
6. Detener completamente Backend y arrancarlo otra vez, siguiendo la ventana de mantenimiento de abajo. Comprobar que sesión vigente, histórico, edición y descargas siguen disponibles. La pérdida de disco local de Render no debe cambiar nada.
7. Desde dos redes, comprobar que no comparten accidentalmente límites por IP; verificar que anteponer IPs arbitrarias no evade el límite. No exponer endpoints de diagnóstico permanentes. Este control del ingreso real está pendiente hasta desplegar.
8. Compartir exclusivamente `https://<FRONTEND_REAL>.onrender.com/` cuando todos los pasos anteriores pasen.

## 10. Actualizaciones y recuperación: una instancia real

El diario mantiene la estrategia existente: preparar UUID/filas, publicar con cambio atómico de revisión y limpiar la anterior. PUT fallido no publica; DELETE fallido conserva diario y se recupera al próximo inicio. No hay una transacción ACID MongoDB/R2. Si falla R2 durante limpieza, no se declara éxito; revisar permisos/conectividad y reiniciar una vez disponible. No borrar metadata para despejar el error.

**Render usa despliegues sin interrupción que pueden solapar proceso viejo y nuevo incluso con una instancia configurada.** Esa superposición no es segura para `recoverOperations`, que podría interpretar una carga en curso del proceso viejo como abandonada. Por ello `autoDeployTrigger: off` y actualizaciones con parada completa son obligatorias para esta versión; no usar Restart Service o Manual Deploy mientras el anterior está atendiendo peticiones.

Para actualizar: avisar mantenimiento, esperar cargas en curso, suspender servicio y confirmar en eventos que el proceso anterior terminó; después desplegar la revisión elegida y reanudar. Si el panel no permite desplegar una revisión mientras está suspendido, mantener el anterior suspendido y crear un **servicio sustituto** con misma configuración/Atlas/R2, comprobarlo y actualizar VITE_API_URL/FRONTEND_URL con sus URLs reales. No reactivar el anterior. Esto conserva los datos externos y evita necesitar coordinación multiinstancia. Ensayar este procedimiento antes de usar datos reales. No ejecutar previews u otro Backend sobre esa misma base/bucket. Una instancia admite múltiples usuarios; el bloqueo por importación evita escrituras simultáneas conflictivas.

## 11. Backups y restauración completa

M0 no incluye backups administrados. Define respaldos diarios y antes de cada actualización, con retención elegida (por ejemplo 7 diarios y 4 semanales), copia cifrada fuera de Render y restauraciones de ensayo periódicas. No se ha configurado una tarea automática externa.

Para respaldo coherente: parar escrituras/Backend, esperar operaciones terminadas, `mongodump --config=/ruta/privada/atlas-tools.yml --db=asesores_horarios --archive=/ruta/privada/respaldo/mongo.archive --gzip`; copiar **todo el bucket** a la carpeta privada `originales/`, con herramienta compatible S3 como rclone. Configurar con `rclone config`, tipo S3, provider Cloudflare, endpoint de cuenta y credenciales de lectura limitadas al bucket; guardar esa configuración fuera del repo con permisos 600. Ejemplo:

```bash
rclone copy r2:ead-originales /ruta/privada/respaldo/originales
rclone check r2:ead-originales /ruta/privada/respaldo/originales --download
```

No usar `sync` (podría borrar), ni confiar solo en ETag como SHA-256. Generar manifiesto SHA-256 local de los originales, guardar fecha, conteos y versión del código con el dump. Proteger también manifiestos pues contienen referencias privadas. No considerar que tener objetos en R2 sea backup independiente: la aplicación elimina originales al reemplazar/eliminar.

Para restaurar: conservar el destino actual, preparar base vacía y bucket privado nuevo, restaurar dump sin --drop y copiar originales con las mismas claves. Usar `copiar-originales-r2.js --apply` con MongoDB restaurado y TIEMPOS_STORAGE_DIR apuntando a la copia de seguridad; luego verificar sin --apply. Confirmar conteos/IDs y hashes, arrancar solo un Backend con ambos destinos restaurados, revisar recuperación y ejecutar controles del paso 9. Cambiar URI/bucket juntos; volver atrás cambiando ambas variables a la pareja anterior si falla la aceptación. La base local y los backups no se borran automáticamente.

## 12. Desarrollo y pruebas

Backend/.env mantiene MongoDB local: `MONGODB_URI=mongodb://127.0.0.1:27017/asesores_horarios`, NODE_ENV=development, PORT=3000, FRONTEND_URL=http://localhost:5173, STORAGE_PROVIDER=local, TRUST_PROXY=none. TIEMPOS_STORAGE_DIR es opcional; HOST solo puede ajustar el bind de desarrollo y no debe definirse en Render (producción fuerza 0.0.0.0). Frontend/.env: `VITE_API_URL=http://localhost:3000/api`. No sobrescribir los .env existentes al actualizar.

```bash
npm ci --prefix Backend
npm ci --prefix Frontend
npm run dev --prefix Backend
# En otra terminal:
npm run dev --prefix Frontend
```

Pruebas: MongoDB local activo; las suites crean/eliminan exclusivamente sus bases temporales y carpetas de prueba. `npm test --prefix Backend` no usa R2 real. `npm run build --prefix Frontend` compila. Los tests opcionales privados necesitan TEST_EXCEL_PATH, TEST_CSV_PATH, TEST_SEPTEMBER_CSV_PATH, TEST_HISTORICAL_JSON_PATH; TEST_MONGOD_PATH habilita reinicio de un MongoDB temporal independiente. Los nombres reales se leen únicamente de esos archivos externos y ya no están hardcodeados en las pruebas/documentación.

## 13. Costos y límites comprobados (27/09/2026)

- Render Static Site gratuito y Web Service Free: 750 horas/mes por workspace, duerme tras 15 minutos sin tráfico, arranque aproximado de un minuto, sin Shell/disco persistente/escalamiento. Bandwidth y minutos de build tienen cuotas del workspace: comprobar Billing → Monthly Included Usage; excederlos puede cobrar o suspender servicios/builds si no hay pago. Render puede suspender tráfico saliente inusualmente alto hacia Atlas/R2 y recomienda no usar Free para producción crítica. [Fuente oficial](https://render.com/docs/free).
- Atlas Free M0: 512 MB aproximadamente (documentos más índices), 500 conexiones, 100 operaciones/segundo y 10 GB de entrada + 10 GB de salida por siete días; sin backup automático. Inactividad prolongada puede pausar el cluster. Pool EAD máximo 10 conexiones. [Límites Atlas](https://www.mongodb.com/docs/atlas/reference/free-shared-limitations/).
- R2 Standard: 10 GB-mes, 1 millón de operaciones A y 10 millones B por mes gratis; salida directa sin cargo. Después, USD 0.015/GB-mes, USD 4.50/millón A y USD 0.36/millón B. Copias/HEAD/verificaciones consumen operaciones, los backups también ocupan almacenamiento. No es un límite duro de gasto; revisar facturación/alertas. [Precios R2](https://developers.cloudflare.com/r2/pricing/).

No se requiere dominio comprado ni servicio adicional de pago. No se promete disponibilidad continua ni costo cero ilimitado. Revisa las tarifas mostradas por cada cuenta antes de aceptar servicios.

Referencias técnicas: [AWS SDK v3 para R2](https://developers.cloudflare.com/r2/examples/aws/aws-sdk-js-v3/), [tokens R2](https://developers.cloudflare.com/r2/api/tokens/), [salidas Render](https://render.com/docs/outbound-ip-addresses), [Blueprint](https://render.com/docs/blueprint-spec), [SPA](https://render.com/docs/redirects-rewrites), [solapamiento al desplegar](https://render.com/docs/deploys), [ingreso y rate limiting](https://render.com/articles/how-render-handles-ddos-attacks).
