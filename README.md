# progCompBack

Backend de Tecla-Ton. La API para autenticación, perfiles y ranking se despliega como **Supabase Edge Function**; los datos viven en Supabase Auth y PostgreSQL. La API Express y los contenedores Docker se conservan para desarrollo local y para integrar el ejecutor más adelante.

## Despliegue en Supabase

1. Crea un proyecto en [Supabase](https://database.new/) y guarda el **Project Reference** y la contraseña de la base de datos.
2. En **Project Settings → API Keys**, copia la **Project URL**, la **Publishable key** (`sb_publishable_…`) y la **Secret key** (`sb_secret_…`). La clave secreta jamás va en Vercel ni en el navegador.
3. Instala Supabase CLI, inicia sesión y vincula el proyecto desde la raíz del repositorio backend:

	```powershell
	npx supabase login
	npx supabase link --project-ref TU_PROJECT_REF
	```

4. Aplica la migración SQL incluida. `db push` puede solicitar la contraseña de base de datos que guardaste al crear el proyecto:

	```powershell
	npx supabase db push
	```

	Crea `profiles`, `exercise_scores`, el trigger de perfil y el RPC transaccional de puntuación. RLS queda activado y el RPC solo se concede al rol `service_role`.
5. En **Edge Functions → Secrets** configura `APP_PUBLISHABLE_KEY`, `APP_SECRET_KEY` y `FRONTEND_ORIGIN`. Usa la Publishable key y la Secret key copiadas desde Settings → API Keys; para el origen escribe el URL exacto de Vercel, sin barra final. Supabase proporciona `SUPABASE_URL` al runtime. No pegues las claves reales en GitHub ni en el frontend.
6. Despliega la función:

	```powershell
	npx supabase functions deploy api --use-api
	```

	`--use-api` evita depender de Docker en la máquina que hace el deploy de la función.
7. En Vercel configura `VITE_SUPABASE_URL` con la Project URL y `VITE_SUPABASE_PUBLISHABLE_KEY` con la Publishable key. El cliente construye la URL `/functions/v1/api`. Vuelve a desplegar Vercel para que Vite incorpore estas variables.
8. Prueba `https://TU_PROJECT_REF.supabase.co/functions/v1/api/health`, luego registro, salida y ranking. Después puedes restringir el registro desde la configuración de la app cuando estén creadas las cuentas.

## Cuenta y modelo de identidad

La interfaz permite usuario y contraseña. La función crea internamente una dirección técnica `usuario@users.teclaton.invalid`, confirma la cuenta desde el servidor y exige contraseña de al menos 8 caracteres. No se envía correo ni se publica esa dirección. No actives inicio de sesión anónimo. Si ya existen usuarios locales creados en la versión anterior, no se migran automáticamente: deberán registrarse de nuevo o habrá que preparar una importación controlada.

## Estado del juez (todavía no conectado)

La función de Supabase sirve ejercicios, cuentas, sesión y ranking. **`/run` y `/submit` devuelven HTTP 503 deliberadamente**, sin consumir intentos ni alterar puntajes, hasta integrar el ejecutor de código. Supabase Edge Functions no ejecuta los contenedores Docker actuales. El SQL ya deja lista la operación atómica de puntuación para que el futuro juez la llame después de evaluar una solución. No anuncies envíos operativos hasta conectar y probar un sandbox.

## Seguridad y pruebas

- El frontend solo recibe la Publishable key. El backend de la Edge Function usa la Secret key y valida cada JWT con Supabase Auth.
- RLS está activado; el acceso administrativo se queda en la función. La función limita registro, login y envíos; CORS acepta solo `FRONTEND_ORIGIN` configurado.
- Los tokens se guardan en `localStorage`; mantén la política de seguridad del frontend y HTTPS activados. No copies claves, JWT, archivos `.env` ni datos reales al repositorio.
- La limitación de solicitudes de la función es en memoria y puede reiniciarse entre instancias. Para un evento con 40 participantes, prueba picos y añade un rate limiter/cola persistente al integrar el juez.
- Ejecuta `npm test` en `backend` para verificar los 18 casos retenidos y las reglas de puntuación. Estos casos siguen presentes en el repositorio público; no deben considerarse secretos de evaluación.

## Desarrollo local del backend Express

Node.js 18+, `npm ci` y Docker Engine son necesarios para `npm start` y para el ejecutor Docker local. La función de Supabase se desarrolla/despliega por separado con la CLI. El despliegue Supabase no levanta el servidor Express.
