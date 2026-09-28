# EAD · Asesores y horarios

> **Despliegue vigente:** [sesión en el mismo origen](deploy/SESION-SAME-ORIGIN.md). Esta guía sustituye las instrucciones anteriores de frontend y API en servicios separados; las instrucciones de Atlas, R2 y respaldo siguen aplicando.

Proyecto **preparado para despliegue en Render, Atlas y R2**; pendiente configurar y verificar las cuentas externas. Conserva Home y Tiempos e incorpora registro, consulta, búsqueda, filtros, edición, estatus, eliminación e importación/exportación Excel con persistencia real.

## Arquitectura

React + Vite + JavaScript + React Router DOM → HTTP / API REST → Node.js + Express → Mongoose → MongoDB local en desarrollo / Atlas en producción, con originales en almacenamiento local / R2 privado. Compass permite consultar los datos del servidor MongoDB. El navegador solo conoce `VITE_API_URL`.

Las carpetas anteriores `client` y `server` fueron renombradas a **Frontend** y **Backend**. No se utiliza Docker ni una base de datos alternativa.

## Estructura

```text
Frontend/
  src/
    components/         Header, Hero, CategoryNav, SearchBar, Layout
      asesores/         Modal, AsesorForm, AsesorFilters, AsesorTable,
                        ImportExcel, DeleteConfirm
    pages/              HomePage, TiemposPage, AsesoresPage
    services/           api.js, asesoresApi.js
    styles/             global.css, asesores.css
    App.jsx, main.jsx
  .env.example, index.html, vite.config.js, package.json, package-lock.json
Backend/
  src/
    config/             env.js, database.js
    models/             Asesor.js
    controllers/        healthController.js, asesorController.js
    routes/             healthRoutes.js, asesorRoutes.js
    middleware/         security.js, rateLimiters.js, upload.js,
                        validateObjectId.js, errorHandlers.js
    services/           excelService.js, excelParser.js, excelWorker.js
    utils/              validation.js
    app.js, server.js
  test/                 integration.test.js, browser-server.js
  .env.example, package.json, package-lock.json
```

## Requisitos y ejecución

Node.js 22.12+ compatible, npm y MongoDB Community Server activo en `127.0.0.1:27017`. MongoDB ya está instalado. Si está detenido, utiliza el servicio de tu instalación: en macOS consulta `brew services list` y ejecuta `brew services start <nombre-del-servicio-mongodb>`. Para una instalación manual utiliza `mongod --dbpath /ruta/a/tus/datos` con tu directorio existente. No inicies una segunda instancia sobre un servicio activo.

Comprobación de MongoDB:

```bash
mongosh "mongodb://127.0.0.1:27017" --quiet --eval 'db.runCommand({ ping: 1 })'
```

En una terminal, desde la raíz:

```bash
cd Backend
npm install
# Si aún no existe .env:
cp -n .env.example .env
npm run dev
```

En otra terminal:

```bash
cd Frontend
npm install
# Si aún no existe .env:
cp -n .env.example .env
npm run dev
```

Frontend: **http://localhost:5173**. Backend: **http://localhost:3000**. Asesores: **http://localhost:5173/asesores**. Tiempos: **http://localhost:5173/tiempos**.

`Backend/npm start` ejecuta sin nodemon. En Frontend, `npm run build` genera `dist` y `npm run preview` sirve la compilación, normalmente en el puerto 4173. Para esa vista previa, agrega `http://localhost:4173` a `FRONTEND_URL` y reinicia Backend.

## Variables de entorno

`Backend/.env`:

```dotenv
PORT=3000
MONGODB_URI=mongodb://127.0.0.1:27017/asesores_horarios
FRONTEND_URL=http://localhost:5173
NODE_ENV=development
```

`FRONTEND_URL` admite una lista explícita de orígenes separados por comas, sin barra final ni comodines. Por ejemplo `http://localhost:5173,http://localhost:4173`. CORS rechaza los orígenes no autorizados; las herramientas locales sin cabecera Origin pueden llamar a la API.

`Frontend/.env`:

```dotenv
VITE_API_URL=http://localhost:3000/api
```

Los `.env`, `node_modules`, `dist`, `.DS_Store` y logs están ignorados; `.env.example` y lockfiles sí se incluyen. No se incluyen datos personales del Excel en el código ni en fixtures versionados.

## Modelo y unicidad

Colección **asesores**, modelo **Asesor**, base **asesores_horarios**:

- `campana`: texto requerido, hasta 100 caracteres.
- `nombreAsesor`: texto requerido, hasta 160 caracteres.
- `jornada`: número de horas, de 0.25 a 24, con precisión de minutos.
- `tiempoBreak`: minutos enteros, de 0 a 240 y menor que la jornada.
- `horario`: texto normalizado `HH:MM A HH:MM`, reloj de 24 horas; permite turnos nocturnos. Inicio y fin deben ser diferentes.
- `estatus`: `Activo` o `Inactivo`, por defecto `Activo`.
- `createdAt`, `updatedAt`: timestamps administrados por Mongoose.
- `campanaNormalizada`, `nombreNormalizado`: claves internas, no editables por API.

Se normalizan Unicode, espacios iniciales/finales/repetidos y mayúsculas/minúsculas para identidad. Se conservan los acentos: no se fusionan nombres distintos por suposición. El ejemplo contiene seis campañas y 56 nombres distintos. Se eligió **campaña + nombre** para no impedir que una persona figure en campañas diferentes. No hay un identificador personal independiente, por lo que dos homónimos dentro de una campaña se consideran duplicados.

Índices: `campana_nombre_unique` (compuesto único), `nombre_orden` (nombre normalizado + ID, para orden estable) y `estatus_jornada` (filtros combinados), además de `_id`. Los índices se crean antes de abrir el servidor. MongoDB garantiza la unicidad también ante peticiones simultáneas. Duplicados manuales devuelven HTTP 409; duplicados de importación se omiten sin sobrescribir datos existentes.

No se fuerza que la duración del horario coincida con la jornada: el archivo de referencia contiene diferencias entre ambos campos y se conservan los datos originales.

## Uso y CRUD

1. En Asesores, pulsa **Registrar asesor** y completa los seis campos.
2. Busca por nombre o campaña; combina Campaña, Estatus y Jornada. Las consultas se realizan en Backend, con 25 filas por página en la interfaz.
3. **Editar** actualiza los campos. El botón del estatus cambia Activo/Inactivo.
4. **Eliminar** abre una confirmación con el nombre y campaña antes de ejecutar DELETE.
5. Recarga la página o reinicia los servidores: los documentos permanecen en MongoDB.

La API no se sustituye con localStorage ni datos de ejemplo. El buscador de Home sigue siendo visual. Tiempos incorpora el historial documentado más abajo.

## Importación de archivos diferentes

Pulsa **Importar Excel** y selecciona hasta 10 archivos `.xlsx` o `.xls`, de hasta 5 MB cada uno. La interfaz procesa **un archivo por petición** y permite revisar cada uno antes de guardarlo.

La vista previa permite:

- Elegir hoja del libro.
- Elegir la fila de encabezados (primeras 100 filas) y releerla.
- Relacionar cada columna con Campaña, Nombre asesor, Jornada, Tiempo break y Horario; Estatus es opcional.
- Revisar una muestra de filas y seleccionar unidades de jornada y descanso.

La detección admite encabezados sin acentos, diferencias de mayúsculas/espacios y alias como `Asesor`, `Nombre completo`, `Descanso`, `Horas` o `Turno`. No depende del nombre del archivo, del orden de columnas ni del estilo visual. Si un encabezado no se reconoce o es ambiguo, hay que asignarlo manualmente. Se omiten filas vacías y encabezados repetidos; las celdas combinadas verticalmente pueden aportar su valor a las filas del mismo bloque.

Los cinco campos obligatorios deben existir. No se inventan datos faltantes ni se intenta interpretar cualquier diseño arbitrario: archivos con datos distribuidos en secciones sin una tabla, horarios separados en múltiples columnas o nombres divididos requieren reorganizar las columnas antes de importar.

Duraciones aceptadas: números, textos como `7 horas` o `30 min`, `HH:MM[:SS]` y valores de tiempo de Excel. En modo automático, jornada numérica = horas y descanso numérico = minutos; una celda con formato de hora o un descanso entre 0 y 1 se interpreta como fracción de día. Usa la selección explícita de unidades si el número es ambiguo (por ejemplo, `0.5` horas de descanso).

El archivo de referencia tiene fórmulas externas VLOOKUP para descansos. Se utilizan sus **resultados calculados guardados**; nunca se ejecutan fórmulas, macros ni vínculos externos. Una fórmula sin caché o con error invalida solo su fila y se informa. No se deriva una regla de descansos de una muestra incompleta.

Al importar se devuelven encontrados, nuevos, duplicados y errores, con fila y motivo (hasta 100 detalles). La importación suma registros y conserva los anteriores. Si la base se interrumpe después de algunas escrituras, el mensaje indica cuántas se completaron; puede repetirse el archivo, pues el índice único evita duplicados. No es una transacción de todo el archivo.

Límites adicionales: 20 hojas, 100 columnas, 10,000 filas de datos por archivo y hasta 100 filas previas al encabezado. XLSX tiene límite de 30 MB descomprimido, 20 MB por entrada y 2,000 entradas. El parser corre en un worker con límite de heap de 128 MB y 15 segundos. Se permiten dos importaciones simultáneas; los archivos se procesan en memoria y no se conservan en disco.

## Exportación

**Descargar Excel** consulta todos los documentos actuales de MongoDB, incluyendo inactivos, independientemente de filtros y paginación. Genera `ASESORES - HORARIOS.xlsx`, hoja `Hoja1`, con este orden:

`CAMPAÑA`, `NOMBRE ASESOR`, `JORNADA`, `TIEMPO BREAK`, `HORARIO`.

Conserva los encabezados azules, bordes y estilos de jornada, descanso y horario del ejemplo. Amplía columnas para que los nombres sean legibles. Jornada es numérica; descanso es una duración Excel con formato `h:mm:ss`. No exporta IDs, claves internas, timestamps, fórmulas externas ni estatus en la hoja principal. La exportación utiliza cursor de MongoDB y escritura de XLSX por streaming. Los textos que empiezan con `=`, `+`, `-` o `@` se escriben como celdas de texto, nunca como fórmulas.

## API

- `GET /api/health`: estado API/Mongoose, 200 conectado o 503 desconectado.
- `GET /api/asesores`: filtros `search`, `campana`, `estatus`, `jornada`, `page`, `limit` (máximo 100). Incluye `data`, `pagination` y opciones de filtros.
- `GET /api/asesores/:id`: un documento.
- `POST /api/asesores`: creación con JSON.
- `PUT /api/asesores/:id`: actualización de los campos del asesor.
- `PATCH /api/asesores/:id/estatus`: JSON con `estatus`.
- `DELETE /api/asesores/:id`: eliminación de un documento.
- `POST /api/asesores/importar`: multipart; `archivo`, `modo` (`vista-previa` o `importar`) y `opciones` (JSON opcional).
- `GET /api/asesores/exportar`: XLSX completo, sin parámetros de consulta.

Las opciones de importación son `sheet`, `headerRow` (base 1), `mapping` (índices de columna base 0), `jornadaUnit` y `breakUnit` (`auto`, `horas`, `minutos`, `excel`). La vista previa no escribe en MongoDB.

Ejemplo de creación:

```json
{"campana":"MI CAMPAÑA","nombreAsesor":"NOMBRE DEL ASESOR","jornada":7,"tiempoBreak":30,"horario":"08:00 A 15:00","estatus":"Activo"}
```

Comprobar salud:

```bash
curl -i http://localhost:3000/api/health
```

Respuesta:

```json
{"success":true,"message":"API funcionando","database":"connected"}
```

## Seguridad implementada

- Helmet global y CORS con orígenes, métodos y cabeceras explícitos.
- Backend enlazado a `127.0.0.1` en desarrollo y `0.0.0.0` en producción. Las APIs privadas requieren una sesión con cookie HttpOnly. No hay roles diferenciados: todos los usuarios creados por el administrador pueden gestionar asesores y tiempos. CORS no sustituye autenticación.
- Rate limiting por IP: 600 solicitudes API, 120 escrituras, 60 peticiones de importación/vista previa y 20 exportaciones por cada 15 minutos. Al exceder: HTTP 429 con cabeceras de espera. El almacén es en memoria para esta instancia local.
- JSON y formularios limitados a 32 KB; creación/edición/estatus exigen JSON.
- Listas de campos permitidos, tipos y rangos estrictos. Objetos, arrays, operadores NoSQL y campos internos enviados como datos son rechazados.
- Filtros MongoDB construidos explícitamente; regex de búsqueda escapada y limitada a 80 caracteres. Se aplica tiempo máximo a las consultas de listado. La búsqueda parcial puede recorrer registros; no se presenta como búsqueda indexada de texto completo.
- ObjectId validado antes de consultar, ID inexistente 404, duplicados 409, entradas inválidas 400 y tamaños excesivos 413.
- Multer en memoria: un archivo por petición; extensión, MIME y firma reales verificados. XLSX requiere estructura de libro válida; ZIP con macros o cifrado se rechaza. No se usan nombres de archivo para escribir rutas.
- Errores JSON consistentes, sin stack traces, URI de MongoDB ni detalles internos en respuestas.
- Exportación con celdas de texto tipadas para prevenir Formula Injection.

Se usa SheetJS 0.20.3 desde su [distribuidor oficial](https://docs.sheetjs.com/docs/getting-started/installation/nodejs/), ExcelJS para estilos y yauzl para validar el contenedor XLSX. La dependencia uuid de ExcelJS se fija a una versión corregida mediante `overrides` (ExcelJS utiliza la API `v4`).

## MongoDB Compass

Conecta a `mongodb://localhost:27017`, actualiza y abre **asesores_horarios → asesores**. El modelo crea la colección y sus índices al iniciar. Desde Compass comprueba nuevos documentos, campos editados, estatus, timestamps y eliminaciones. En **Indexes**, comprueba `campana_nombre_unique` con `unique: true`.

Para probar duplicados, importa un archivo, observa el total y vuelve a importarlo: los nuevos deben ser 0 y el total no debe aumentar. Un registro manual con el mismo nombre/campaña, incluso con otra capitalización o espacios, devuelve 409. Otro archivo con filas nuevas agrega únicamente esas filas.

## Pruebas automatizadas

```bash
cd Backend
npm test
```

Para incluir el archivo privado real:

```bash
TEST_EXCEL_PATH="/ruta/a/ASESORES - HORARIOS.xlsx" npm test
```

La suite crea una base temporal `nexo_test_<timestamp>` en MongoDB local y elimina **solo esa base** al terminar. No utiliza `asesores_horarios` ni conserva datos sintéticos en ella. Prueba CRUD, persistencia, duplicados simultáneos, acumulación, XLS/XLSX, mapeo, fórmulas, exportación y ataques/errores de entrada. El Excel de referencia no se copia al repositorio. Sin `TEST_EXCEL_PATH`, se ejecutan los fixtures generados y se informa que falta la referencia privada.

Para una comprobación visual aislada opcional, ejecuta `node test/browser-server.js` en Backend y `VITE_API_URL=http://localhost:3001/api npm run dev -- --port 5174` en Frontend. Estos puertos son exclusivos de pruebas. Detén el servidor de pruebas con Ctrl+C para eliminar su propia base `nexo_browser_test_<pid>`. El uso normal sigue en 3000/5173.

## Etapa: historial de tiempos y archivos

Se conserva React + Vite → API REST → Express → Mongoose → MongoDB local. En desarrollo no se requieren Docker, TypeScript ni servicios externos; producción utiliza Atlas y R2. Las pruebas no importan datos a `asesores_horarios`: emplean bases y directorios temporales que eliminan al finalizar.

### Inicio y primer usuario

En una terminal dentro de `Backend`, ejecutar `npm run usuario:crear`. Solicita nombre de usuario y contraseña de 12–128 caracteres con entrada oculta. No hay usuario ni contraseña predeterminados. El comando guarda un hash scrypt con sal, nunca la contraseña. Repetir el comando permite crear otros usuarios con el mismo acceso de gestión; no hay registro público ni recuperación de contraseña en esta etapa.

Luego iniciar `npm run dev` en Backend y `npm run dev` en Frontend. Abrir `http://localhost:5173/login`. Iniciar sesión habilita `/asesores` y `/tiempos`. Sin sesión, ambas rutas redirigen a `/login`. La cookie dura 8 horas, es HttpOnly, SameSite=Strict en desarrollo, y SameSite=None con Secure en producción; se guarda únicamente el hash del token de sesión en MongoDB, con expiración TTL. Cerrar sesión invalida el token. No se guardan tokens en localStorage.

Usar `localhost` tanto para frontend como para URL de API durante desarrollo; mezclar `localhost` y `127.0.0.1` en el navegador afecta las cookies SameSite. El URI de MongoDB sí usa `127.0.0.1`.

`GET http://localhost:3000/api/health` continúa público y debe responder 200, `success: true`, `database: "connected"` con MongoDB disponible.

En Compass conectar a `mongodb://127.0.0.1:27017`, abrir `asesores_horarios` y actualizar colecciones: `asesores`, `usuarios`, `sesions`, `importaciontiempos` y `tiempodiarios`. Los nombres de colecciones nuevas son los generados por Mongoose. Los documentos de tiempos aparecen después de una importación realizada desde la aplicación. No compartir hashes de usuarios o sesiones.

### Almacenamiento y modelos

- `ImportacionTiempos`: metadata del archivo, SHA-256, fecha diaria, contadores, incidencias, autor, timestamps y referencia a la revisión activa. Índices únicos por hash y fecha.
- `TiempoDiario`: `importacionId`, revisión, `asesorId` cuando está identificado, fecha, valores procesados en segundos, horas de sesión, parámetros de la plantilla al importar, datos de origen internos y marcas de auditoría.
- `Usuario` y `Sesion`: acceso seguro sin contraseñas ni tokens en claro dentro de MongoDB.

Archivos originales en `Backend/storage/tiempos/<UUID>.csv|xlsx|xls`. La carpeta no se publica con `express.static`. Solo Backend determina las rutas. El nombre original es metadata y nombre de descarga, nunca una ruta física. El directorio se crea al importar; los archivos tienen permisos 0600. Está excluido de Git.

Opcionalmente `TIEMPOS_STORAGE_DIR` configura una ruta absoluta alternativa. La implementación de almacenamiento está separada en `src/storage/tiemposStorage.js` con proveedores local y R2. En producción se exige R2 y no se escribe en el disco de Render. Respaldar juntos MongoDB y este directorio; un respaldo solo de MongoDB no incluye originales.

### Importación y formatos

En Tiempos, **Importar archivo** acepta CSV UTF-8 (BOM opcional, coma/punto y coma/tabulador), XLSX y XLS con la estructura semántica del reporte real. Máximo 5 MB, 10,000 filas y 100 columnas; Excel admite hasta 20 hojas, con una única hoja candidata. Los encabezados pueden estar en las primeras 100 filas y cambiar de orden. Se normalizan acentos, mayúsculas y espacios de encabezados.

Columnas requeridas observadas en `300626.csv`:

```text
Nombre
Fecha
Inicio de Sesión
Cerrado de Sesión
Total (HH:MM:SS)
PAUSA HH:MM:SS
PAUSERETROALIMENTACIONHHMMSS
PAUSEBAÑO15MINO30MINP/10HHHMMSS
PAUSEBREAKHHMMSS
```

Las demás columnas se ignoran para el reporte. CSV usa fecha ISO `YYYY-MM-DD`, sesiones `YYYY-MM-DD HH:mm:ss` y duraciones `HH:mm:ss`. Excel admite esos textos o valores nativos de fecha/hora y fracciones de día, con sistema de fechas 1900. No se adivinan fechas ambiguas ni nombres de columnas desconocidos. Libros con época 1904 deben convertirse al sistema 1900. Un formato distinto requiere mapear su semántica antes de añadirlo al parser; la importación flexible de **Asesores** mantiene su mapeo manual anterior.

Cada archivo corresponde a un día. Un segundo archivo diferente del mismo día se gestiona mediante **Reemplazar** para evitar doble conteo. SHA-256 impide duplicar contenido incluso cambiando el nombre. Los nombres de asesores se normalizan con Unicode NFKC, espacios y mayúsculas; coincidencias ambiguas entre campañas no se vinculan automáticamente. No se usa coincidencia difusa. No se crean asesores.

Se aceptan filas válidas de una importación nueva y se reportan las inválidas. Nombres repetidos dentro del archivo se excluyen y se indican como error, porque no existe una regla confirmada para combinar resúmenes repetidos. Los no identificados se conservan como filas procesadas con `asesorId: null`, pero no participan en acumulados de una persona. Se agregan filas “Sin registro” para los asesores activos ausentes, con valores pendientes; no equivalen a ausencia confirmada o adeudo. Se excluyen de “días con registro”.

Con los ejemplos proporcionados se verificaron 61 filas del CSV, 48 identificadas, 13 no identificadas y 0 errores; con los 56 asesores de la plantilla resultaron 69 filas de reporte, incluidas 8 sin registro.

### Reglas actuales de cálculo (v2)

Las fórmulas están en `Backend/src/services/processMetrics.js`. El Excel histórico solo se usó para validar y no es una dependencia de la aplicación.

- Conexión y total trabajado: `Total (HH:MM:SS)` del marcador.
- PAUSA: consumo de `PAUSA HH:MM:SS`. PAUSA RETRO: consumo de `PAUSERETROALIMENTACIONHHMMSS`. Vacíos de consumo representan cero; valores inválidos no se convierten a cero.
- Break: `max(0, consumido - tiempoBreak del asesor × 60)`. No se usa la tabla histórica como sustituto de la maestra.
- Baño: `max(0, consumido - BANO_PERMITIDO_SECONDS)`, con 15 minutos centralizados en el servicio.
- Retardo: `max(0, hora real de entrada - inicio del horario del asesor)`.
- Diferencia bruta: `total trabajado - jornada del asesor × 3600`.
- Si la diferencia bruta es positiva, la diferencia neta resta el retardo. Si es negativa o cero, se conserva. Cuando la diferencia bruta es exactamente cero, adeudo de jornada y tiempo a favor son cero, conforme a la condición estricta de excedente positivo indicada.
- Adeudo jornada: `max(0, -diferenciaNeta)`. Tiempo a favor: `max(0, diferenciaNeta)`. Nunca son positivos simultáneamente.
- Total adeudo: `adeudoJornada + adeudoBreak + adeudoBano`. No suma pausa, retro o exceso de retro ni compensa estos adeudos con el tiempo a favor.

Todas las operaciones son numéricas, en segundos. Se guardan horario aplicado, jornada y tolerancias, consumos, total trabajado, retardo, diferencias, adeudo de jornada, tiempo a favor y exceso de retro cuando existe. Las duraciones acumuladas superan 24 horas sin envolver el reloj. No se inventan semáforos: rojo únicamente para total mayor que cero.

Falta de datos reales se muestra **Sin dato** (`null`), no “Pendiente” ni un cero inventado. Los asesores no identificados conservan consumos conocidos, pero su jornada y break no pueden inferirse. Una sesión sin cierre conserva los datos conocidos y una advertencia. Las horas de inicio/fin no se deducen de la duración.

La fecha procede del contenido. Para nombres `DDMMYY.csv|xls|xlsx`, si difiere, se guarda una advertencia. El parser reconoce ambas variantes reales del encabezado de baño (`10HHMMSS` y `10HHHMMSS`). Los campos opcionales TIMEEXCEEDED sirven solo para diagnóstico: vacíos significan validación no disponible; una discrepancia no detiene la importación.

Al iniciar Backend, después de recuperar operaciones interrumpidas, se actualizan los registros antiguos a v2. Cada documento conserva `calculoAnterior`; las correcciones manuales no se sobrescriben. La operación es reanudable e idempotente. Se mantienen jornada/break previamente almacenados; el horario se toma de la maestra al actualizar porque antes no se guardaba. Se registra esa procedencia. Nuevas importaciones guardan los parámetros aplicados para que futuros cambios en la plantilla no alteren silenciosamente el histórico.

### Historial, Ver y descargas

**Archivos importados** muestra todas las importaciones, ordenadas por fecha de carga descendente y paginadas (15 en la interfaz, límite API máximo 100). Filtros por nombre y fecha de los datos. Incluye archivo, tamaño, fecha de carga, fecha de datos, contadores, estado y acciones.

**Ver** carga exclusivamente los registros de la revisión activa de esa importación. La tabla usa fecha superior y los nueve encabezados finales, con colores de la referencia; no expone la tabla CSV cruda. La interfaz pagina el reporte en grupos de 50.

**Descargar original** valida sesión e ID y devuelve los mismos bytes almacenados. **Descargar reporte** crea XLSX con ExcelJS: fecha superior, bordes, encabezados azul/gris/naranja/rojo, anchos, congelación, filtros y duraciones numéricas `[h]:mm:ss`. Los valores desconocidos son texto “Sin dato”. La hoja Observaciones explica reglas e incidencias. Las cadenas se exportan como texto y nunca como fórmulas.

### Reemplazar, editar y eliminar en MongoDB standalone

No se usan transacciones ficticias. La instancia local es standalone. Se utiliza un diario de operación persistente y una revisión activa por importación:

1. Validar y procesar primero el archivo nuevo, comprobar fecha, filas y duplicados.
2. Adquirir un bloqueo por documento con comparación de la revisión activa.
3. Guardar el nuevo original con UUID y todos sus registros como revisión preparada, aún invisible a consultas.
4. Publicar la revisión completa mediante una actualización atómica de la referencia en `ImportacionTiempos`.
5. Eliminar registros y archivo de la revisión anterior, luego limpiar el diario.

Un fallo antes de publicar conserva la revisión anterior. Se rechaza reemplazar por otra fecha o por un archivo con filas inválidas/repetidas. El reemplazo vuelve a procesar el día con la plantilla actual y sustituye las correcciones manuales anteriores; el diálogo lo avisa. Las consultas filtran por revisión activa para no sumar dos versiones.

**Editar** permite solo conexión, pausa, pausa retro, inicio/fin y adeudos de break/baño. Acepta `HH:mm:ss` o segundos enteros en API (0–86,400), y `null` para pendientes. Guarda marca manual, fecha, usuario y una copia de los valores originales anteriores a la primera corrección. Se conserva el archivo original sin alterarlo. No es un historial exhaustivo de cada edición intermedia. El total se recalcula con las reglas v2 y no acepta escritura directa.

**Eliminar** requiere confirmación en un diálogo con nombre, fecha y consecuencias. Backend recibe solo el ID: marca la importación como Eliminando, la excluye de consultas, borra sus tiempos y archivo, y elimina metadata al final. Nunca elimina asesores. Al completarse, se puede reimportar el mismo archivo.

Al iniciar Backend, `recoverOperations()` termina eliminaciones pendientes, retira revisiones preparadas que no se publicaron y completa la limpieza de revisiones antiguas ya sustituidas. Si la limpieza no puede terminar por permisos o falta de MongoDB, se conserva el diario para reintentar al reiniciar; no se comunica éxito de una eliminación incompleta. Esta coordinación está diseñada para **una sola instancia de Backend**, también en Render. No equivale a una transacción de filesystem y MongoDB ni debe ejecutarse con varios backends simultáneos sobre el mismo almacenamiento.

### Acumulados

La vista **Historial por asesor** busca en la plantilla y permite día, semana (lunes a domingo), mes, año y rango personalizado de máximo 10 años. Los límites se calculan como fechas de calendario, sin convertir duraciones a `Date`. MongoDB relaciona cada tiempo con su importación activa y suma campos en una agregación. Muestra tiempo de conexión, pausa, retro, adeudos, días con registro y detalle paginado. Editar, reemplazar o eliminar se refleja en la siguiente consulta sin cachés ni acumulados materializados desactualizados.

### Endpoints finales

Públicos: `GET /api/health`, `POST /api/auth/login`.

Sesión: `GET /api/auth/session`, `POST /api/auth/logout`.

Todas las rutas existentes `/api/asesores/*` y las siguientes requieren sesión:

```text
POST   /api/tiempos/importaciones                   multipart: archivo
GET    /api/tiempos/importaciones                   page, limit, fecha, nombre
GET    /api/tiempos/importaciones/:id               metadata + reporte activo
GET    /api/tiempos/importaciones/:id/original      descarga original
GET    /api/tiempos/importaciones/:id/excel         descarga XLSX procesado
PUT    /api/tiempos/importaciones/:id/archivo       reemplazo multipart: archivo
DELETE /api/tiempos/importaciones/:id               eliminación completa
PATCH  /api/tiempos/registros/:id                   corrección de campos permitidos
GET    /api/tiempos/historial                       asesorId, tipo, fecha, desde, hasta, page, limit
```

`tipo`: `dia`, `semana`, `mes`, `ano`, `rango`. `fecha` es la referencia de los primeros cuatro; rango usa `desde`/`hasta`. Fecha ISO en API. IDs de 24 dígitos hexadecimales.

Las escrituras, incluido login, requieren `X-EAD-Request: 1`; el navegador envía `credentials: include`. Si hay cabecera Origin debe coincidir exactamente con `FRONTEND_URL`. CORS permite credenciales solo desde los orígenes configurados. SameSite y cabecera personalizada con preflight reducen CSRF. Nunca se configura origen `*` con credenciales.

Se conserva Helmet y rate limiting general; login tiene límite de intentos, importación/reemplazo comparte su limitador y capacidad de dos cargas concurrentes; edición/eliminación y descarga tienen sus respectivos límites. Se comprueban MIME, extensión, firmas de Excel, estructura CSV, tamaño comprimido/descomprimido y límites de worker. Validación explícita de campos evita NoSQL injection y mass assignment. No hay rutas públicas a storage, y los nombres físicos solo aceptan UUID y extensiones previstas. Errores API no incluyen stack, contraseña ni ruta física. Respuestas privadas llevan Cache-Control: no-store.

### Verificación de esta etapa

Desde la raíz, con MongoDB local activo:

```bash
TEST_CSV_PATH='/ruta/300626.csv' \
TEST_EXCEL_PATH='/ruta/ASESORES - HORARIOS.xlsx' \
TEST_MONGOD_PATH='/ruta/al/binario/mongod' \
npm test --prefix Backend
npm run build --prefix Frontend
```

Sin paths privados las pruebas utilizan fixtures mínimos; sin `TEST_MONGOD_PATH`, solo se omite la prueba que reinicia un proceso MongoDB adicional. Esa prueba usa un puerto dinámico y una carpeta temporal: no reinicia el MongoDB principal. Las suites usan bases con prefijos `nexo_test_`, `nexo_tiempos_test_` y un MongoDB separado para persistencia, con limpieza al finalizar.

Resultado de la etapa anterior: **30 pruebas correctas, 0 fallos, 0 omitidas** al proporcionar los tres paths anteriores. Casos verificados con resultado correcto:

- Regresión de Asesores: crear/consultar/editar/estatus/eliminar, filtros, Excel real, deduplicación, variantes XLS/XLSX, mapeo flexible, exportación, fórmulas como texto, límites y validación.
- Sesión: rutas privadas 401, login, cookie HttpOnly/SameSite, rechazo de contraseña incorrecta, CSRF, logout y sesión invalidada.
- CSV real: 61 filas, vinculación sin crear asesores, metadata, hash y archivo físico.
- Duplicados por contenido y por fecha; historial paginado y filtrado.
- Descarga original idéntica byte a byte y XLSX procesado con formatos/colores.
- Edición: segundos persistidos, auditoría, rechazo de total/IDs/campos ajenos, total recalculado con la fórmula definida.
- Segunda fecha; cinco periodos; acumulados de 46 horas sin pérdida por formato.
- Reemplazo incorrecto conserva versión anterior; reemplazo correcto retira archivo y registros previos.
- Reemplazos concurrentes sin revisiones antiguas ni archivos sobrantes.
- XLS/XLSX equivalentes, encabezados reordenados y fechas/duraciones numéricas nativas de Excel.
- Seguridad: NoSQL, ObjectId, path traversal, storage privado, falsos archivos, tamaño, origen y CSRF.
- Recuperación de un reemplazo interrumpido y persistencia al reconectar.
- Reinicio real de procesos separados de Backend y MongoDB: persisten sesión, metadata, registros y archivo original.
- Eliminación completa, cero huérfanos, conservación de asesores, acumulados actualizados y reimportación.
- Compilación Vite y revisión en navegador: login, redirección protegida, reporte con colores, edición visible, acumulados y consola sin errores graves.

Las reglas pendientes de la etapa anterior fueron resueltas y verificadas en v2, como se describe a continuación. La sesión y el reporte sobreviven a la recarga del frontend; no se requiere estado en memoria del navegador para persistir datos.

### Inventario de archivos de esta etapa

Creados en Backend:

```text
scripts/crear-usuario.js
src/auth/password.js
src/middleware/auth.js
src/middleware/tiemposUpload.js
src/models/Usuario.js
src/models/Sesion.js
src/models/ImportacionTiempos.js
src/models/TiempoDiario.js
src/routes/authRoutes.js
src/routes/tiemposRoutes.js
src/services/tiemposParser.js
src/services/tiemposWorker.js
src/services/tiemposService.js
src/storage/tiemposStorage.js
src/utils/tiempo.js
test/tiempos.test.js
test/persistence.test.js
```

Creados en Frontend:

```text
src/auth/AuthContext.jsx
src/pages/LoginPage.jsx
src/services/tiemposApi.js
src/components/tiempos/TiemposTable.jsx
src/components/tiempos/TiemposModals.jsx
src/components/tiempos/AsesorHistory.jsx
src/styles/tiempos.css
```

Modificados: `.gitignore`, `README.md`; Backend `package.json`, `package-lock.json`, `src/app.js`, `src/server.js`, `src/middleware/security.js`, `src/middleware/errorHandlers.js`, `src/services/excelService.js`, `test/integration.test.js`, `test/browser-server.js`; Frontend `src/App.jsx`, `src/services/api.js`, `src/components/Header.jsx`, `src/components/Layout.jsx`, `src/pages/TiemposPage.jsx`. `Frontend/dist/` es salida regenerada e ignorada por Git.

Dependencias añadidas: Backend `csv-parse` y `cookie`. No se añadieron dependencias al Frontend. ExcelJS, SheetJS, Mongoose, Multer, Helmet, CORS y rate limiting ya existían.

Commit sugerido (no se ejecutó un commit; esta carpeta no tiene repositorio Git inicializado):

```text
feat: administrar historial y archivos de tiempos con edición y eliminación segura
```

## Etapa v2: fórmulas completas y login

El login ahora usa una tarjeta centrada con marca **EAD**, iconos de usuario/candado, control mostrar/ocultar contraseña, botón ancho y errores dentro de la tarjeta. Reutiliza la paleta existente: primario `#302735`, hover `#53425f`, fondo `#f8f6fa`, bordes `#e1dce5` y la tipografía global. No copia CCC.UNO, naranja ni enlaces inexistentes. La autenticación por cookie y las rutas privadas se conservan. El acceso sigue siendo por usuario, porque la autenticación existente no usa correo.

Archivos del login: `Frontend/src/pages/LoginPage.jsx`, `Frontend/src/styles/login.css` (nuevo), `Frontend/src/App.jsx` (login fuera del layout de navegación) y retirada del estilo antiguo `.login-card` en `Frontend/src/styles/tiempos.css`.

Fórmulas y persistencia: nuevos `Backend/src/services/processMetrics.js`, `Backend/src/services/recalculateExistingMetrics.js`, `Backend/test/metrics.test.js`; actualizados parser, servicio de tiempos, modelos TiempoDiario/ImportacionTiempos, helpers, rutas de exportación, inicio del servidor y pruebas de integración. La interfaz, editor y acumulados muestran “Sin dato” y la fórmula actual. No se instalaron dependencias nuevas.

### Resultados con el archivo de septiembre

`300926.csv` contiene **30 registros del 26/09/2026**. Procesados 30, errores 0; 6 sesiones sin cierre se conservan con advertencia. Con la maestra local de 56 asesores se identifican 13 y quedan 17 sin identificar; no se crean ni se modifican asesores para forzar coincidencias. Los no identificados necesitan una asociación real en la maestra para calcular jornada y break.

Ejemplos con la maestra actual:

- Caso anonimizado 1: break 00:17:14, baño 00:00:00, retardo 00:01:43, a favor 00:59:42, total adeudo 00:17:14.
- Caso anonimizado 2: break 00:11:44, baño 00:02:13, jornada 00:01:35, total 00:15:32.
- Caso anonimizado 3: break 00:14:39, baño 00:01:03, total 00:15:42.
- Caso anonimizado 4: PAUSA 01:45:08 y conexión 06:02:31 se leen directamente; falta su asesor en la maestra local para calcular jornada/break reales. En la prueba controlada con jornada 6 h y horario 08:00 se obtiene retardo 00:00:48 y a favor 00:01:43; ese horario de prueba no se atribuye a su registro real.

Discrepancia de validación del CSV: Caso anonimizado 5 tiene baño consumido 00:30:12, que produce 00:15:12 de adeudo; TIMEEXCEEDED indica 00:03:42. Se guarda el adeudo calculado con los 15 minutos y un diagnóstico. Campos TIMEEXCEEDED vacíos se consideran sin validación disponible.

### Comparación contra el Excel histórico

El libro contiene registros BASE hasta **25/09/2026**, sin datos BASE del día 26. No se afirma coincidencia diaria del nuevo CSV con un día inexistente en ese libro.

Se compararon las fórmulas de break y baño con sus valores históricos almacenados usando los parámetros de cada fila del libro: **850/850 break coinciden**, **854/855 baño coinciden**. Cinco filas de break no tenían entradas/resultados numéricos comparables. Estas comparaciones validan las fórmulas, no que las tolerancias históricas sean iguales a las de la maestra actual. Por ejemplo, hay filas con 45 minutos históricos aun cuando la tabla BREAK del libro contiene otros valores.

La excepción es **Caso anonimizado 6, 15/09/2026**: `BASE!AI523` está vacío, pero `BASE!BO523` contiene `=IF(BN523>AK520,BP523,AK520-BN523)`, que referencia break de otra fila (`AK520`) y produce 00:15:12. La regla actual usa el consumo de baño de su propia fila y da cero. No se copió ese error al Backend.

También se contrastaron consumos y fórmulas de búsqueda del reporte:

- Caso anonimizado 7, 01/09: `TIEMPOS LIVERPOOL!L15:M15` = pausa 00:15:26, retro 00:00:00; `P15:Q15` = break 00:00:00, baño 00:02:24.
- Caso anonimizado 7, 23/09: `HX15:HY15` = pausa 00:21:37, retro 00:17:42; `IB15:IC15` = break 00:03:45, baño 00:00:00.
- Caso anonimizado 8, 23/09: `HY17` = retro 00:17:26, `IC17` = baño 00:05:30.

El total histórico usa en algunos sitios metas diarias y compensaciones diferentes, por lo que las reglas nuevas explícitas prevalecen; no se ajustaron resultados para imitar esas fórmulas.

### Pruebas v2

Resultado final: **42 pruebas correctas, 0 fallos y 0 omitidas** con los archivos de referencia configurados. Compilación de producción y paquete de despliegue verificados.

Se verificaron los casos A–L solicitados, límites de cero, duraciones mayores de 24 horas, datos inválidos/faltantes, sesión abierta, variantes de encabezado, fecha interna, diagnósticos, edición y suma exacta del total. Las pruebas de Asesores, importaciones, descargas, reemplazo, concurrencia, eliminación, seguridad e historial siguen pasando. La actualización histórica conserva respaldo y correcciones y no se vuelve a aplicar a documentos v2.

Se probaron el CSV de septiembre guardado en MongoDB temporal, descarga XLSX con resultados nuevos, login correcto/incorrecto, mostrar/ocultar contraseña, estado de carga, logout, redirección protegida y diseño de escritorio/móvil sin scroll horizontal. Las cuentas de prueba se eliminan con su base temporal.

Variables adicionales de prueba: `TEST_SEPTEMBER_CSV_PATH` para el CSV de septiembre y `TEST_HISTORICAL_JSON_PATH` para la extracción de lectura del libro histórico. Estos archivos privados no se incluyen en el repositorio ni son dependencias de ejecución.

El histórico existente local conservó sus 56 asesores, 1 importación y 69 tiempos; los 69 documentos se actualizaron a v2 con copia de valores anteriores. Ninguna fila identificada de ese histórico quedó sin total. El CSV nuevo se usó en pruebas aisladas, no se agregó automáticamente al histórico principal.

Commit sugerido:

```text
feat: completar calculos de tiempos y rediseñar login
```

## Despliegue en producción

La arquitectura vigente es **GitHub → Render Static Site (Frontend) + Render Web Service (Backend, una instancia) → MongoDB Atlas M0 + Cloudflare R2 privado**. Render no conserva originales ni datos persistentes. No hay despliegue externo ejecutado ni cuentas de nube verificadas.

Sigue [la guía paso a paso](deploy/README.md): contiene Atlas, R2, variables, comandos exactos de Render, GitHub, migración sin borrado, alta de usuarios, validación y backup/restore. [render.yaml](render.yaml) reproduce ambos servicios sin secretos. [deploy/backend.env.example](deploy/backend.env.example) contiene la plantilla de producción.

La dirección principal `/` abre `/login` directamente, en la misma pestaña. Home se conserva en `/inicio`, detrás de sesión, igual que Asesores y Tiempos. Una sesión vigente permite entrar al programa sin volver a escribir la contraseña. Logo original aportado por el propietario en `Frontend/public/ead-logo.png`, usado en login, encabezado y favicon.

La marca visible es EAD. La cabecera CSRF se migró coordinadamente a `X-EAD-Request`. Se conserva `nexo_session` por compatibilidad con sesiones existentes y los prefijos `nexo_*` de bases temporales para mantener sus comprobaciones de limpieza; no son marca visible. No cambian la base `asesores_horarios`, las colecciones, IDs, originales ni fórmulas. `processMetrics.js`, parsers y el servicio de negocio no fueron modificados en esta preparación.

El proveedor se configura con `STORAGE_PROVIDER=local` (por defecto en desarrollo) o `r2` (obligatorio en producción). Variables de R2: `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET` y opcional `R2_ENDPOINT`, derivado de la cuenta. Se usa AWS SDK v3 `@aws-sdk/client-s3`, región `auto`, operaciones privadas con timeout, PUT condicional sin sobrescritura y verificación SHA-256 al leer. Las claves UUID históricas se conservan en la raíz del bucket. `TIEMPOS_STORAGE_DIR` solo aplica al proveedor local. Nunca hay URL pública de descarga.

MongoDB conecta con selección/conexión de 10 segundos, timeout de socket de 45 segundos y pool máximo de 10 conexiones. El driver reconecta tras caídas; mientras tanto `/api/health` devuelve 503. Inicializa todos los índices antes de escuchar y mantiene sesiones en MongoDB. Se ejecuta la recuperación del diario antes de abrir HTTP. El health no consulta R2 en cada petición: un health correcto no acredita R2; comprobarlo mediante una importación y descarga autenticadas.

CORS usa exclusivamente `FRONTEND_URL`; no deduce permisos de Host. Producción requiere orígenes HTTPS. `TRUST_PROXY=render` confía en un salto de ingreso, nunca en toda la cadena. Ver limitaciones y verificación de IP en la guía. Mantiene todos los límites de peticiones originales. Se retiró el alta por `BOOTSTRAP_USER`/`BOOTSTRAP_PASSWORD`: los usuarios se crean únicamente con la consola interactiva, sin defaults ni registro público. Los logs de arranque no imprimen mensajes de errores del proveedor que pudieran contener URIs.

Las pruebas normales usan archivos sintéticos y un cliente S3 simulado: no consumen R2 ni necesitan credenciales de nube. Los casos privados requieren variables explícitas y se informan como omitidos cuando faltan. Se corrigió la preparación de la prueba de migración histórica para que use dos importaciones nuevas sin ediciones previas de otros casos; las expectativas y fórmulas se conservaron. Los resultados numéricos de etapas anteriores arriba son históricos; el informe de esta entrega indica la ejecución actual.

### Validación de preparación EAD

La suite normal descubre 56 pruebas: 51 correctas, 0 fallidas y 5 opcionales omitidas por falta de variables privadas/binario MongoDB adicional. La compilación Vite genera dist correctamente. La revisión en navegador verifica logo EAD BPO y apertura directa de la raíz a /login. No se ejecutaron pruebas contra cuentas reales Atlas/R2/Render.

La regresión adicional con los archivos privados proporcionados y TEST_MONGOD_PATH finalizó con **56 correctas, 0 fallidas y 0 omitidas**, incluyendo reinicio real de Backend y MongoDB temporal. Las pruebas R2 utilizan un cliente S3 simulado, no una cuenta externa.
