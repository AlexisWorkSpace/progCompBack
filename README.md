# progCompBack

API Express y juez de Tecla-Ton. Incluye casos de prueba en `exercises.js`, validación especial para el problema C, autenticación, ranking y perfiles de ejecución aislados en Docker. Los enunciados están en `ejercicios.txt`.

## Requisitos y ejecución local

- Node.js 18 o posterior.
- Docker Engine y Docker CLI disponibles para el proceso del backend.

Instala dependencias con `npm ci`, configura `CORS_ORIGIN=http://localhost:5173` si necesitas CORS en desarrollo, y ejecuta `npm start`. Comprueba `/health`. `npm test` ejecuta las pruebas unitarias del juez y las reglas de puntuación.

## Variables de entorno

- `PORT`: puerto HTTP; la plataforma debe proporcionar este valor.
- `CORS_ORIGIN`: lista separada por comas de los orígenes permitidos; requiere coincidencia exacta, por ejemplo `https://prog-comp-front.vercel.app`.
- `USER_DATA_DIR`: directorio persistente para `users.json` y `auth-secret`. En Railway monta un volumen persistente en `/app/data` y define `USER_DATA_DIR=/app/data`.
- `ALLOW_REGISTRATION=false`: deshabilita nuevas cuentas tras registrar a los participantes.
- `MAX_CONCURRENT_RUNS`: límite de ejecuciones simultáneas; por defecto `4`.

## Preparar despliegue en Railway

1. Crea un proyecto Railway e importa `AlexisWorkSpace/progCompBack` desde GitHub. Usa la raíz del repositorio como raíz del servicio; `railway.json` define el comando de inicio y `/health` como healthcheck.
2. Añade las variables `CORS_ORIGIN`, `USER_DATA_DIR=/app/data`, `ALLOW_REGISTRATION=true` y `MAX_CONCURRENT_RUNS=2`. Para CORS, escribe el origen exacto que Vercel asignó al frontend, sin ruta ni barra final.
3. Añade un **Volume** y móntalo en `/app/data`. Los usuarios, puntuaciones y clave que firma sesiones se guardan ahí; no despliegues o escales varias réplicas con el archivo JSON.
4. Genera un dominio Railway y comprueba `https://<dominio>/health`.
5. En Vercel define `VITE_API_URL=https://<dominio>` y vuelve a desplegar el frontend.
6. Prueba registro, inicio de sesión, ranking y luego un envío. No compartas el dominio con participantes hasta resolver el requisito del ejecutor indicado a continuación.

No subas archivos `.env`, datos de usuarios, claves de firma, tokens, certificados ni contraseñas al repositorio. Conserva el mismo volumen de datos al reiniciar el servicio; perder `auth-secret` invalida las sesiones existentes.

## Importante: Railway y el juez Docker

Railway puede construir e iniciar esta API Node, pero el servicio necesita Docker CLI y un Docker daemon accesible para compilar y ejecutar los envíos. El despliegue Nixpacks por sí solo **no proporciona ese daemon**: `/health`, ejercicios, cuentas y ranking pueden responder, mientras que `/run` y `/submit` fallarán al no encontrar un Docker Engine. No expongas un daemon Docker sin TLS ni montes un socket Docker público. El frontend también exige sesión para ejecutar código.

Antes de anunciar el juez como operativo en producción, conecta el backend a un ejecutor aislado dedicado con autenticación y límites de recursos, o aloja el backend en infraestructura que proporcione un daemon Docker seguro. Una variable `DOCKER_HOST` por sí sola no crea ni protege ese daemon.

## Protecciones incluidas y límites

- Las rutas para ejecutar y enviar código requieren sesión; el registro, inicio de sesión, ejecución y envíos tienen límites de solicitudes en memoria por IP/usuario.
- CORS usa una lista explícita; encabezados de seguridad, tamaño máximo del cuerpo, límites globales de concurrencia y límites por contenedor restringen el uso.
- Las contraseñas se almacenan con scrypt; los tokens tienen firma HMAC y vencen a los siete días. Los resultados actuales viven en un archivo JSON local: usa volumen persistente y una sola instancia, o sustituye el almacenamiento por una base de datos compartida antes de escalar.
- El limitador por IP está en memoria y no coordina varias instancias. CORS no es autenticación. Aun con el sandbox, la ejecución de código no confiable requiere una revisión de seguridad antes de abrir el servicio a Internet.
