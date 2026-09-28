# Corrección de sesión: un origen público

## Diagnóstico y límite de la evidencia

El bundle anterior llamaba a la API absoluta en otro subdominio de onrender.com. onrender.com es un sufijo público: esos servicios son sitios distintos. Safari bloquea cookies de terceros; SameSite=None y credentials:include no anulan esa política. El login 200 acredita las credenciales, pero no acredita que el navegador almacene/envíe la cookie. CORS ya respondía con el frontend correcto. La captura de session 401 anterior al login no demuestra por sí sola un bloqueo posterior: queda pendiente confirmar el flujo real en Safari después de desplegar.

Referencias: https://publicsuffix.org/list/public_suffix_list.dat y https://webkit.org/blog/10218/full-third-party-cookie-blocking-and-more/ . Render documenta rewrites de contenido (https://render.com/docs/redirects-rewrites), pero no se verificó en la cuenta un proxy de API que preserve métodos, cookies y subidas. No se presupone esa capacidad. La alternativa implementada sirve el build de React desde Express en el servicio existente; no añade un proxy ni cambia Atlas/R2.

## Render: aplicar al servicio EXISTENTE ead-api-f0iw

No crear otro backend ni recrear bases de datos. Conservar región, plan, conexiones y secretos existentes.

1. Publicar el commit en GitHub con los comandos de abajo.
2. En Settings del Web Service existente, dejar **Root Directory vacío** (raíz del repositorio). Build Command: `npm run build`. Start Command: `npm start`. Health Check Path: `/api/health`.
3. En Environment configurar estos valores públicos exactos:
   - `NODE_ENV=production`
   - `SERVE_FRONTEND=true`
   - `VITE_API_URL=/api` (se utiliza DURANTE el build)
   - `FRONTEND_URL=https://ead-api-f0iw.onrender.com` (sin barra final)
   - `TRUST_PROXY=render`
   - `STORAGE_PROVIDER=r2`
   - `NODE_VERSION=22.22.0`
4. **No modificar** MONGODB_URI, usuarios, hashes, base/colecciones, R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY ni R2_BUCKET. No ejecutar crear-usuario.js ni migraciones. No introducir secretos en variables VITE_. No fijar PORT: conservar el asignado por Render.
5. Desplegar ambos componentes mediante **un solo build del servicio ead-api existente**. El Static Site ead-web ya no sirve como entrada de esta versión. El YAML describe el estado final; editarlo en Git no cambia automáticamente servicios creados manualmente.
6. Mantener una sola instancia y Auto Deploy desactivado. Respetar la ventana de mantenimiento y el requisito previo del proyecto de no solapar procesos durante la recuperación de importaciones: detener el proceso anterior antes de arrancar el nuevo. Un despliegue habitual sin interrupción puede solaparlos; coordinarlo con el mecanismo de mantenimiento de Render antes de desplegar.
7. Abrir y compartir **https://ead-api-f0iw.onrender.com/login**. La raíz redirige directamente allí, en la misma pestaña. Después de validar, sustituir en el Static Site antiguo el rewrite `/* -> /index.html` por un **redirect** `/* -> https://ead-api-f0iw.onrender.com/login`. No es un proxy de API. Así los enlaces anteriores llegan al nuevo login. No hace falta reconstruir el Static Site.

El build falla si VITE_API_URL no es /api: evita publicar por accidente otro frontend cross-site. Si SERVE_FRONTEND=true sin Frontend/dist/index.html, el arranque falla explícitamente. Desarrollo local mantiene Vite en 5173 y API en 3000 con las variables locales existentes; no activar SERVE_FRONTEND localmente.

## Comandos Git (no ejecutados automáticamente)

Desde la raíz del repositorio:

```bash
git status --short
git add Backend/src/app.js Backend/src/frontend.js Backend/src/routes/authRoutes.js Backend/test/frontend.test.js Backend/test/r2-integration.test.js Frontend/vite.config.js package.json render.yaml README.md deploy/README.md deploy/SESION-SAME-ORIGIN.md
git diff --cached --check
git diff --cached
git commit -m "fix: servir EAD y API en el mismo origen para conservar la sesión"
git push origin main
```

## Aceptación en Safari

Mantener activada la prevención de seguimiento. Abrir una ventana privada en la nueva URL y limpiar el registro de red. Iniciar sesión con Administrador y su contraseña existente, sin compartirla.

1. Login POST 200 en el mismo host del documento. Set-Cookie: nexo_session; HttpOnly; Secure; SameSite=Strict; Path=/api; sin Domain.
2. Comprobar una petición session **posterior** al login: 200 y Cookie presente (no copiar su valor). Las peticiones deben ir a ead-api-f0iw.onrender.com/api, igual que el documento.
3. Abrir Tiempos y Asesores; importaciones carga 200. Recargar /tiempos y comprobar que sigue autenticado. Revisar una descarga existente sin modificar datos.
4. Logout 200, regresa a /login. session posterior devuelve 401 y la cookie queda eliminada.

Las pruebas automatizadas usan datos sintéticos en MongoDB local temporal y R2 simulado, no la cuenta de producción. Una cookie enviada manualmente en pruebas de HTTP no verifica las políticas de Safari: completar esta aceptación tras desplegar. No se modificaron usuarios ni datos de producción.
