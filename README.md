# Tecla-Ton — Supabase API y juez local

El frontend se despliega en Vercel; Supabase ofrece Auth, PostgreSQL, la Edge Function API y una cola durable; una PC Ubuntu dedicada ejecuta `judgeWorker.js`. La PC solo abre conexiones salientes a Supabase: **no se publica el servicio Docker ni se abren puertos de juez hacia Internet**.

La competencia está configurada para hasta **40 equipos / 80 participantes**. Cada equipo puede ser de una o dos personas. Ambos miembros comparten intentos, puntaje y ranking. El juez usa diez casos, uno por ejercicio, para controlar carga; esta cobertura es básica y no reemplaza un juez completo con pruebas límite.

## A. Supabase: proyecto, base de datos y Edge Function

1. Crea un proyecto en [Supabase](https://database.new/). Guarda el **Project Reference**, la contraseña de la base de datos y la Project URL.
2. En **Settings → API Keys** copia la Publishable key (`sb_publishable_…`) y la Secret key (`sb_secret_…`). No compartas ni publiques la Secret key.
3. Desde una terminal con Node.js, entra al repositorio `progCompBack` y vincula la CLI:

   ```powershell
   npx supabase login
   npx supabase link --project-ref TU_PROJECT_REF
   ```

4. Aplica las migraciones **en orden**:

   ```powershell
   npx supabase db push
   ```

   `db push` puede pedir la contraseña de la base de datos. Las migraciones crean perfiles, equipos, puntajes de equipo, límites de 40/80, RLS y la cola durable `judge_jobs`.
5. En **Edge Functions → Secrets** define `APP_PUBLISHABLE_KEY`, `APP_SECRET_KEY` y `FRONTEND_ORIGIN` (origen exacto Vercel, sin barra final). Supabase proporciona `SUPABASE_URL` automáticamente.
6. Despliega la función:

   ```powershell
   npx supabase functions deploy api --use-api
   ```

7. Verifica `https://TU_PROJECT_REF.supabase.co/functions/v1/api/health`.

Estas migraciones suponen que ya se aplicaron en este proyecto las migraciones base anteriores del repositorio. Si es un proyecto nuevo, `db push` las aplica en secuencia. No pegues SQL de una migración manualmente y luego intentes aplicarla también con la CLI.

## B. Vercel: configuración del frontend

En las variables de producción de Vercel configura:

- `VITE_SUPABASE_URL=https://TU_PROJECT_REF.supabase.co`
- `VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_…`

Elimina la antigua variable `VITE_API_URL`. La Secret key Supabase y la clave del worker **nunca** se agregan a Vercel. Redepliega después de editar variables.

## C. Inscripción de los 80 participantes

1. El primer integrante escoge **Crear equipo de dos**, registra nombre/carrera, pone el nombre del equipo y el nombre completo esperado de la otra persona. La interfaz mostrará un código de invitación de 10 caracteres; debe enviárselo por un canal privado.
2. Su compañero elige **Ya tengo invitación**, escribe sus datos y el código. Debe usar el nombre que el primer integrante declaró.
3. Una persona sola elige **Participar solo** y asigna un nombre a su equipo individual.
4. Ambos participantes tienen cuenta propia; el equipo comparte puntos e intentos. No puede enviar soluciones un equipo de pareja hasta que el segundo integrante se registre.

El máximo se valida también en PostgreSQL. Confirma nombres/carreras y equipos antes del concurso; no publiques códigos de invitación.

## D. Convertir la PC Intel/16 GB en juez dedicado

Recomendación: instalar **Ubuntu Server 24.04 LTS x86-64** en esa PC y dejarla dedicada al evento. Haz copia de archivos y verifica cuidadosamente el disco destino antes de instalar; una instalación limpia puede borrar Windows y sus datos. Conecta por Ethernet, desactiva suspensión, configura reinicio tras corte eléctrico/UPS si existe y reserva la IP local.

1. Instala Ubuntu y actualízalo. Instala **Docker Engine** con la guía oficial de Ubuntu: [docs.docker.com/engine/install/ubuntu](https://docs.docker.com/engine/install/ubuntu/). Verifica Docker con `docker run --rm hello-world`.
2. Instala Node.js 22 LTS. Clona el repositorio backend completo en `/opt/tecla-ton` y ejecuta `npm ci` desde esa carpeta:

   ```bash
   sudo mkdir -p /opt/tecla-ton
   sudo chown "$USER":"$USER" /opt/tecla-ton
   git clone https://github.com/AlexisWorkSpace/progCompBack.git /opt/tecla-ton
   cd /opt/tecla-ton
   npm ci
   ```

3. Crea `/etc/tecla-ton/worker.env` a partir de `worker.env.example`. Completa `SUPABASE_URL`, `SUPABASE_SECRET_KEY` (Secret key `sb_secret_…`) y `MAX_CONCURRENT_RUNS=3`. Protege el archivo (`sudo chmod 600 /etc/tecla-ton/worker.env`) y limita su lectura al administrador. Esta clave tiene privilegios administrativos sobre el proyecto Supabase.
4. Inicia el worker en primer plano para probar conexión y descargar/construir runtimes:

   ```bash
   cd /opt/tecla-ton
   set -a
   source /etc/tecla-ton/worker.env
   set +a
   node judgeWorker.js
   ```

   Espera a que verifique las imágenes Python, Java, C y C++; comprueba el log de polling y detén la prueba con Ctrl+C.
5. Instala el servicio systemd incluido y arráncalo:

   ```bash
   sudo mkdir -p /etc/tecla-ton
   sudo nano /etc/tecla-ton/worker.env
   sudo chmod 600 /etc/tecla-ton/worker.env
   sudo cp /opt/tecla-ton/deploy/tecla-ton-judge.service /etc/systemd/system/
   sudo systemctl daemon-reload
   sudo systemctl enable --now tecla-ton-judge
   sudo systemctl status tecla-ton-judge
   sudo journalctl -u tecla-ton-judge -f
   ```

   El servicio inicia `npm run worker`, usa `EnvironmentFile=/etc/tecla-ton/worker.env`, `Restart=always` y `RestartSec=5`. El worker necesita gestionar Docker; ejecutarlo como root o dar acceso al grupo Docker equivale a privilegios de administrador. Dedica la PC.
6. Mantén el firewall bloqueando conexiones entrantes; permite SSH solo desde la red organizadora. Docker usa `--network none` para cada solución. **No configures port-forwarding, túneles, `DOCKER_HOST` público, ni publiques un puerto API.**
7. Mantén **tres** ejecuciones simultáneas al inicio. La cola admite hasta 200 pendientes. Solo sube a 4 tras probar carga y observar RAM/CPU; el código pone un máximo de 6.

El worker reclama trabajos con `FOR UPDATE SKIP LOCKED`, procesa hasta la concurrencia configurada y borra el código fuente de la fila cuando termina. Al arrancar reencola trabajos que quedaron ejecutándose más de cinco minutos. Si la PC se desconecta, los trabajos permanecen en la cola; no se envían conexiones entrantes a la PC.

### Servidor Express local (`server.js`)

Si se usa `npm start` en lugar de Supabase, las entregas (`POST /submit`) pasan por una cola FIFO en memoria (`submissionQueue.js`). El endpoint responde `202` con `{ jobId, status, queuePosition }` y el cliente consulta `GET /jobs/:jobId` hasta que el estado sea `completed` o `failed`. La cola comparte el límite `MAX_CONCURRENT_RUNS` con `/run`, admite un envío activo por usuario y ejercicio, y rechaza con `429` al superar `MAX_QUEUED_SUBMISSIONS` (200 por defecto). La cola no persiste entre reinicios.

## E. Prueba antes del concurso

1. Despliega las migraciones, secretos, Edge Function y frontend.
2. Inicia el worker y confirma que inspecciona las cuatro imágenes Docker.
3. Registra una cuenta individual y un equipo de prueba con dos integrantes; verifica invitación y que el equipo figure una sola vez en ranking.
4. Encola un envío y observa `queued → running → completed`. Confirma que el puntaje se comparte con los dos participantes.
5. Apaga el worker y crea un envío de prueba: debe quedar en cola sin puntuar. Reinicia el worker y confirma que se procese. Prueba respuesta aceptada, incorrecta y timeout.
6. Haz una prueba escalonada (10, luego 20 y luego 40 participantes de prueba); revisa RAM, CPU, cola, límites de Supabase y conectividad antes del evento.

## Límites y seguridad

- Los 10 casos son **uno por problema** para reducir carga; no garantizan correctitud frente a todos los límites. Amplía las pruebas cuando el ejecutor quede estable.
- Los contenedores no tienen red, corren sin capacidades, con usuario no privilegiado, filesystem de solo lectura y límites de CPU, memoria, procesos, salida y tiempo.
- La clave `sb_secret_…` queda únicamente en los secretos de Supabase y en el archivo protegido del worker. Solo la Publishable key va al navegador.
- RLS está activado; la cola no se expone a participantes. Las operaciones sensibles usan RPCs limitados a `service_role`.
- La cola conserva el código hasta terminar la evaluación; al cerrar el trabajo se limpia el código y los resultados expiran a los siete días.
- Revisa el plan/cuotas y el estado de Supabase antes del evento. Si Supabase pausa el proyecto o hay una caída de Internet, la cola no puede avanzar.
