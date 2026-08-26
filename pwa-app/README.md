# Memoreo — prototipo funcional (PWA)

> "Sé que tenía ese documento, pero no recuerdo dónde lo guardé."
> "Se me olvidó que esto vencía."
>
> Memoreo es tu memoria digital: todo lo importante de tu vida, organizado y recordado.

Este es el **prototipo funcional** de Memoreo: una Progressive Web App (PWA) real,
instalable, que corre en el navegador y funciona sin conexión. No es un mockup — puedes
agregar documentos, editarlos, eliminarlos, buscarlos y ver sus recordatorios
ordenados por urgencia dentro de la propia app.

Tiene cuentas: cada quien se registra con nombre, correo y contraseña, e inicia
sesión para ver su propia información. Las cuentas son **reales**: Supabase Auth
guarda el correo y la contraseña, y una base de datos Postgres compartida (también
Supabase) guarda los documentos, las fotos y los PDFs adjuntos de cada cuenta — ya
no viven en el navegador de cada quien. Ver la sección **"Base de datos real
(Supabase)"** más abajo para el detalle de cómo está armado y cómo configurar tu
propio proyecto.

También existe una **demo visual interactiva** (un solo archivo HTML, publicada como
página web) pensada para mostrar el diseño y flujo a otras personas sin instalar nada.
Este repositorio es el prototipo de código real que sí puedes seguir desarrollando.

## La lógica del producto

Cuatro acciones, el menor número de pasos posible para cada una:

1. **Agregar** — foto o PDF, nombre, categoría, fecha (con atajos como "en 1 año").
2. **Guardar** — un solo botón, sin pasos extra.
3. **Recordar** — vencimientos ordenados por urgencia + aviso real del navegador.
4. **Encontrar** — buscador con filtro por categoría, resultados instantáneos.

No es un gestor de tareas. No hay "pendientes" ni proyectos — solo cosas que guardaste
y fechas que importan.

## Requisitos

- Node.js 18 o superior
- npm

## Cómo correrlo

```bash
npm install
npm run dev
```

Abre la URL que muestra la terminal (normalmente `http://localhost:5173`). Para
probarlo como se vería en un celular, abre las herramientas de desarrollador del
navegador y activa la vista de dispositivo móvil (mobile-first: así está pensado).

Todo lo anterior funciona sin nada más. Lo único que necesita un backend
corriendo aparte es elegir un plan de paga de verdad, porque eso cobra a
través de Stripe — ver **"Cómo funciona el pago con Stripe"** más abajo
(y, para publicarlo con un dominio propio, **"Desplegar en Netlify"**).

## Cómo construir la versión de producción

```bash
npm run build
npm run preview
```

`npm run build` genera la carpeta `dist/` lista para desplegar en cualquier hosting
estático (Vercel, Netlify, Cloudflare Pages, GitHub Pages, un bucket S3, etc.) — no
necesita servidor propio. Incluye automáticamente:

- `manifest.webmanifest` — nombre, colores de marca e íconos para instalar la app.
- `sw.js` — service worker (generado con Workbox vía `vite-plugin-pwa`) que cachea
  la app para que abra al instante y funcione sin conexión.

## Estructura del proyecto

```
index.html          Documento HTML raíz (metadatos, tipografías, PWA meta tags)
vite.config.js       Configuración de Vite + vite-plugin-pwa (manifest, service worker)
netlify.toml         Configuración de Netlify: build, redirects de /api/*
src/
  main.js            Punto de entrada de la app: registra el service worker y monta la app
  app.js             Estado de la app, enrutador entre pantallas (incluye el panel de
                     administrador), eventos, formularios
  auth.js            Cuentas reales vía Supabase Auth: registro, inicio de sesión, sesión activa
  supabaseClient.js    Cliente único de Supabase (URL + llave pública), usado por auth.js y store.js
  views.js            Plantillas HTML de cada pantalla (inicio, agregar, detalle, panel de
                     administrador, etc.)
  store.js           Datos: categorías, y los documentos de cada cuenta guardados en la tabla
                     public.documents de Supabase (con caché en memoria — ver "Base de datos
                     real (Supabase)")
  utils.js           Fechas, formato de urgencia ("vence en 12 días", etc.)
  stripeClient.js     Backend de pagos automático con Stripe — sin usar actualmente (ver
                     "Cómo funciona el pago con Stripe"); el pago manual (transferencia/
                     PayPal) vive en requestManualPayment (auth.js) y paymentRequestSheet (views.js)
  adminTrack.js        No-operación heredada — el panel de administrador ahora lee directo de
                     Supabase (ver "Cómo funciona el panel de administrador")
  adminClient.js        Llama a /api/admin-metrics y /api/admin-payment-requests para el
                     panel de administrador (ver app.js)
  icons.js           Set de íconos SVG propios de la marca, incluido el logo de Memoreo (logoMark)
  style.css           Todo el diseño: paleta, tipografía, componentes, layout de escritorio
  admin.css            Diseño propio de consola de escritorio para el panel de administrador
                       (reutiliza los tokens de color/tipografía de style.css) — vive dentro
                       de la misma app (#adminShell en app.js), no es una página aparte
netlify/functions/    Backend de pagos, borrado de cuenta y panel de administrador
                       como funciones de Netlify — ver "Cómo funciona el pago con Stripe",
                       "Cómo funciona el panel de administrador" y "Desplegar en Netlify"
supabase/
  schema.sql           El esquema completo de la base de datos (tablas, seguridad a nivel de
                       renglón, buckets de archivos) — ver "Base de datos real (Supabase)"
public/
  icons/              Íconos de la app y favicon (generados con scripts/make_icons.py,
                     salvo favicon.svg, el mismo logo a mano en vector)
scripts/
  make_icons.py       Script Python que genera los íconos de marca (editable)

../server/            El mismo backend de pagos, como servidor
                       Express independiente — una alternativa a
                       netlify/functions/ para quien no despliegue en
                       Netlify. Carpeta hermana de esta, no una subcarpeta.
```

Sin frameworks de UI (React, Vue, etc.) a propósito: la app es ligera, rápida de
cargar en celulares con conexión lenta, y fácil de migrar a un framework más adelante
si el equipo lo prefiere — la separación en `store.js` / `views.js` / `app.js` ya
deja ese camino trazado.

## Qué incluye este MVP núcleo

- **Cuentas**: pantalla de bienvenida con "Crear cuenta" / "Iniciar sesión" (nombre,
  correo, contraseña) o un botón de "Probar con una cuenta demo" para explorar sin
  registrarse. Cada cuenta ve únicamente sus propios documentos, y "Cerrar sesión"
  está en Perfil. Tanto "Crear cuenta" como "Iniciar sesión" traen un interruptor
  **"Mantener la sesión iniciada"** (prendido por defecto, el comportamiento de
  siempre): con él prendido, la sesión persiste entre visitas — no hay que volver a
  iniciar sesión cada vez que se abre la app; apagado, la sesión se guarda solo
  mientras esa pestaña siga abierta y se cierra sola en cuanto se cierra el
  navegador, útil en una computadora compartida o un cibercafé (ver
  `setRememberSession`/`dynamicSessionStorage` en `src/supabaseClient.js`, que
  decide entre `localStorage` y `sessionStorage` según lo último elegido). Ver
  **"Cómo funcionan las cuentas hoy"** más abajo.
- **Versión de escritorio**: el mismo código responde a pantallas anchas — la barra
  de navegación inferior (pensada para pulgar en celular) se convierte en un menú
  lateral fijo, y el contenido se centra en una columna más ancha con más columnas
  en las cuadrículas. No es una app separada: es la misma PWA, reflowed. La
  pantalla de bienvenida tiene además su propio diseño de escritorio (ver
  siguiente punto) en vez de ser la pantalla del celular estirada.
- Pantalla de bienvenida (onboarding de un toque, sin formularios) con el logo de
  Memoreo (`logoMark` en `src/icons.js`, el mismo dibujo que usan los íconos de
  instalación) — en escritorio es un layout propio de dos columnas (texto +
  una ilustración de tarjetas de ejemplo), no la pantalla del celular
  agrandada.
- Inicio: saludo, buscador, tira de "vence pronto", categorías con conteo, agregados
  recientes.
- Agregar/editar documento: foto o PDF real (se guarda como miniatura), categoría,
  fecha de vencimiento con atajos, recordatorio configurable, notas. Si la persona
  toca el botón de agregar estando dentro de una categoría (p. ej. viendo Hogar),
  el nuevo elemento arranca ya preseleccionado en esa categoría en vez de pedirle
  escogerla de nuevo — desde cualquier otra pantalla (Inicio, Buscar, etc.) sigue
  arrancando en blanco, como siempre.
- Ocho categorías: **Personal** (documentos de identificación: INE, pasaporte,
  acta de nacimiento), Garantías, Seguros, Vehículo, Hogar, **Estudios**
  (colegiaturas, inscripciones y comprobantes de pago — un documento normal
  con vencimiento opcional, igual que Personal/Garantías/Seguros; adjuntar
  la foto o el PDF del comprobante ya funcionaba desde antes, pero el
  formulario ahora lo recuerda con un texto junto al campo de fecha), **Pagos**
  (recibos recurrentes) y **Préstamos** (dinero prestado o debido), además de
  Salud.
  - **Vehículo** acepta dos tipos de registro en la misma categoría, con
    chips Todos/Documentos/Mantenimiento para filtrar: **Documentos** es un
    documento normal (con vencimiento) — tarjeta de circulación, póliza,
    verificación — y **Mantenimiento** es una bitácora de cuándo se hizo
    algo (servicio del auto, presión de llantas): pregunta "¿cuándo lo
    hiciste?" y deja programar un recordatorio opcional para la próxima vez.
  - **Hogar** es la única categoría con TRES tipos de registro, con chips
    Todos/Documentos/Servicios/Mantenimiento para filtrar (ver `formMode` en
    `src/store.js`):
    - **Documentos** es un documento normal (con vencimiento opcional) —
      pensado para adjuntar el recibo, contrato o garantía ya pagado o
      firmado: contrato de renta, garantía de un electrodoméstico, o el
      comprobante de un pago de luz/agua/gas que ya se hizo (a diferencia de
      Servicios, que rastrea el próximo pago pendiente, no guarda el
      comprobante del pago ya hecho).
    - **Servicios** (agua, luz, gas, internet) funciona igual que la
      categoría **Pagos**: se registra **una sola vez** con la próxima fecha
      de pago conocida y una frecuencia (mensual, bimestral o anual), con
      monto opcional, y Memoreo calcula sola la siguiente fecha cada vez que
      la anterior pasa — nunca hay que volver a capturar el pago de agua o
      luz cada mes o cada bimestre.
    - **Mantenimiento** es una bitácora de cuándo se hizo algo (aire
      acondicionado, cableado eléctrico): igual que en Vehículo.
    - Los registros de Servicios guardados antes de que existiera esta
      distinción de tres siguen funcionando igual (se leen como Servicios,
      nunca como Documentos) — ver la nota junto a `formMode()` en
      `src/store.js` y la migración de la restricción `kind` en
      `supabase/schema.sql`.
  - **Pagos** es para gastos recurrentes con fecha fija (luz, agua, celular):
    se registran **una sola vez** con la próxima fecha de pago conocida y una
    frecuencia (mensual, bimestral o anual — luz normalmente es bimestral,
    agua y celular mensuales), y Memoreo calcula sola la siguiente fecha cada
    vez que la anterior pasa, sin necesidad de volver a capturar el pago.
  - **Préstamos** registra dinero prestado o debido: con quién es (persona),
    cuánto, si "me deben" o "yo debo", y una fecha de pago opcional —
    resuelve el problema de olvidar a quién le prestaste dinero y cuándo se
    supone que te lo regresan.
- Detalle de documento: vista clara con estado de vencimiento (o, para
  Mantenimiento, cuándo se hizo y cuándo toca la próxima vez), editar, eliminar,
  compartir (real: usa la Web Share API nativa del sistema — o copia un
  resumen al portapapeles si el navegador no la soporta — ver `shareDoc` en
  `src/app.js`).
- Buscar: por nombre y por categoría.
- Recordatorios: agrupados por urgencia (vencidos, esta semana, este mes, más
  adelante). No hay recordatorios por correo electrónico — todo se revisa
  dentro de la app.
- **Semaforización**: cada elemento con fecha (o, en Salud, con severidad) muestra
  un punto rojo/ámbar/verde junto a su información en toda la app — en las listas
  de categoría, no solo en la tira de "Vence pronto" — para distinguir de un
  vistazo qué necesita atención primero sin tener que leer cada fecha. El mismo
  criterio (crítico/atención/al día) que ya coloreaba la etiqueta de "vence
  pronto" ahora también pinta ese punto, así que es una sola fuente de verdad
  para la urgencia. La tipografía de esa etiqueta ("Se paga mañana", etc.)
  pasó de monoespaciada a la tipografía normal de la interfaz, para que se lea
  como texto y no como un dato técnico.
- **Categoría Salud, funcional** (antes era un candado fijo — ver el punto 4 de
  "Siguiente paso: backend real" en la versión anterior de este README, ya
  resuelto): cuatro subcategorías — Vacunas, Medicamentos, Pruebas de
  laboratorio y Recetas —, cada una con sus propios campos y su propia forma
  de medir urgencia:
  - **Vacunas**: fecha de aplicación opcional y próxima dosis — la etiqueta de
    urgencia dice "Próxima dosis en X días" (no "Vence en X días": una vacuna
    no vence, lo que se acerca es la siguiente dosis).
  - **Medicamentos**: dosis, frecuencia y fecha en que se agota el
    tratamiento — la etiqueta dice "Se agotará en X días", enmarcado como
    recordatorio de recompra y no como vencimiento.
  - **Pruebas de laboratorio**: cinco tipos (Química sanguínea de 4 elementos
    — glucosa, urea, creatinina, ácido úrico —, Biometría hemática, Funciones
    hepáticas, Hemoglobina glicada y Perfil de lípidos), cada uno con sus
    propios campos numéricos, fecha de la prueba y resultados. En Plan
    Premium Plus, además: **próxima cita médica** (una fecha con
    recordatorio, reutilizando el mismo campo y la misma maquinaria de
    notificaciones que ya usan las demás fechas de la app — ver `healthInfo`
    en `src/utils.js`).
  - **Recetas**: foto o PDF de la receta médica (usando el mismo adjunto de
    Supabase Storage que cualquier otro documento), con fecha de expedición y
    de vencimiento/renovación opcionales — la etiqueta usa el mismo
    "Vence en X días" que un documento normal. Exclusiva de Premium Plus.

  Qué subcategorías están disponibles depende del plan (ver siguiente punto) —
  todo plan, incluido el Gratis, tiene acceso **sin límite de cantidad** a las
  subcategorías que sí desbloquea, para que se pueda conocer y usar el módulo
  de verdad antes de pagar.
- **Planes de tres niveles, con pago manual (transferencia bancaria MX o
  PayPal)** — Perfil muestra el plan actual, cuántos elementos se han
  guardado sobre el límite del plan (Salud no cuenta para este límite) y una
  tarjeta para ver/cambiar de plan:
  - **Gratis**: hasta 5 elementos (fuera de Salud) + Vacunas sin límite. Bajar
    a este plan es instantáneo, sin ningún pago.
  - **Premium**: hasta 20 elementos + agrega Medicamentos y Pruebas de
    laboratorio sin límite.
  - **Premium Plus**: elementos ilimitados + agrega Recetas sin límite +
    dentro de Pruebas de laboratorio agrega próxima cita médica, y además
    desbloquea la personalización de color de la app (ver siguiente punto) —
    es el único plan con acceso a color de acento.

  Elegir Premium o Premium Plus **no cobra nada en el momento**: abre una
  hoja para *solicitar* el plan — cuántos meses pagar (1 a 6, o 1 año) y si
  se prefiere transferencia bancaria (México) o PayPal — y pide un número de
  celular para contactar. Esa solicitud llega al panel de administrador (ver
  **"Cómo funciona el pago manual"** más abajo); el administrador contacta a
  esa persona con los datos bancarios o la liga de PayPal por fuera de la
  app y, en cuanto confirma que ya se pagó, activa la solicitud desde su
  panel — eso es lo único que de verdad sube el plan, y le pone fecha de
  vencimiento según los meses pagados. Intentar guardar un elemento fuera
  del límite del plan, abrir una subcategoría de Salud aún bloqueada, o ver
  la próxima cita de una prueba de laboratorio sin Premium Plus, muestra una
  hoja explicando qué plan la incluye, con un botón directo para cambiar.

  (El código de pago automático con Stripe de versiones anteriores —
  `src/stripeClient.js`, `applyStripeSubscription`, la prueba gratis de 7
  días — se conserva sin usar en el proyecto por si se quiere retomar más
  adelante, pero ninguna pantalla nueva lo llama.)
- **Personalización**: color de acento de la app (seis opciones curadas —
  turquesa, magenta, azul, verde, violeta, ámbar — no un selector de color
  libre), exclusivo de **Plan Premium Plus** — en Gratis y Premium, "Color de
  la app" en Perfil aparece bloqueado con un candado y abre una hoja de venta
  al tocarlo en vez del selector de color — y foto de perfil por cuenta (esta
  sí disponible en todos los planes), ambos en Perfil y aplicados al instante
  en toda la interfaz. Ver **"Cómo funciona la personalización"** más abajo.
- **Mi suscripción**: Perfil → "Mi suscripción" (antes "Facturación") es el
  registro de los pagos de tu propia membresía de Memoreo (no un lugar para
  guardar tus propias facturas de compra) — muestra el plan activo y hasta
  cuándo vale, según la fecha que le puso el administrador al activar tu
  última solicitud de pago. Nunca manda a ningún portal externo.
- **Seguridad y privacidad**: Perfil → "Seguridad y privacidad" permite
  cambiar la contraseña de verdad (Supabase Auth valida la contraseña actual
  antes de aceptar la nueva) y eliminar la cuenta por completo — borra de
  verdad la cuenta de Supabase Auth, su perfil, todos sus documentos y sus
  archivos adjuntos de la base de datos (ver **"Base de datos real
  (Supabase)"**), con una confirmación antes de hacerlo, sin poder
  deshacerse.
- Instalable como app (ícono de "Instalar" cuando el navegador lo permite; en iPhone,
  Safari > compartir > "Agregar a pantalla de inicio").
- Funciona sin conexión una vez que se cargó por primera vez.

## Cómo funcionan las cuentas hoy

Las cuentas son **reales**, de principio a fin: [Supabase](https://supabase.com)
(Postgres administrado, con Auth y Storage incluidos) es el backend — ver
**"Base de datos real (Supabase)"** más abajo para el esquema completo y cómo
configurar tu propio proyecto. Este apartado es solo el resumen del lado de
cuentas; `src/auth.js` tiene el código.

- Un registro llama a `supabase.auth.signUp()` — Supabase guarda el correo y la
  contraseña del lado del servidor (nunca pasan por nuestro propio código, ni en
  texto plano ni hasheados). En el mismo instante, un trigger de la base de datos
  crea el renglón de `public.profiles` de esa cuenta (nombre, plan, color,
  preferencias — ver el esquema) ligado 1 a 1 por el mismo id.
- Cada cuenta tiene su propia lista de documentos en `public.documents`,
  protegida con Row Level Security: la propia base de datos, no el código de la
  app, es quien impide que una cuenta vea o modifique los documentos de otra.
- La sesión activa la guarda y refresca sola la librería de Supabase (con su
  propio almacenamiento en el navegador), por eso recargar la página o volver
  más tarde no pide iniciar sesión de nuevo — hasta que alguien toca "Cerrar
  sesión".
- Como las cuentas y los documentos ya no viven en un navegador en particular,
  una cuenta creada en el celular **sí** aparece, con todo y su información, al
  iniciar sesión en la laptop.

**Nota sobre la confirmación por correo:** por defecto, un proyecto nuevo de
Supabase exige confirmar el correo antes de poder iniciar sesión (Supabase manda
ese correo solo). Si prefieres que crear una cuenta la deje lista al instante —
el comportamiento que tenía este prototipo antes de la migración —, desactiva
esa opción en tu proyecto: **Authentication → Providers → Email → "Confirm
email"**.

## Cómo funciona la personalización

Color de acento y foto de perfil se guardan de verdad en la cuenta (ver
**"Base de datos real (Supabase)"**) — lo único "simulado" aquí es que el
color de acento en sí es una de seis opciones curadas, no un selector de
color libre; todo lo demás, incluida la foto de perfil, es tal cual se ve:

- **Color de acento**: elegir uno de los seis colores curados en Perfil →
  "Color de la app" cambia al instante las variables de color de marca
  (`--brand`, `--brand-solid`, etc.) en toda la app, no solo en una pantalla.
  Técnicamente se inyecta una hoja de estilo pequeña (`<style id="accentOverride">`)
  que redefine esas variables reproduciendo el mismo patrón de tres estados que
  ya usa `style.css` para modo claro/oscuro — así elegir un color no rompe la
  detección automática de modo oscuro del sistema (un color con `:root{...}`
  en línea sí la rompería, porque ganaría siempre sin importar el modo). Ver
  `applyAccentColor` en `src/app.js`. Es exclusivo de Plan Premium Plus: la
  preferencia elegida se guarda en la cuenta igual que siempre, pero solo se
  **aplica** de verdad si el plan actual la permite — `effectiveAccentColor`
  en `src/app.js` decide, en cada punto donde se pinta el color de marca, si
  usar la preferencia guardada o el turquesa por defecto, así que bajar de
  Premium Plus regresa la app al color de marca sin perder la preferencia
  elegida, y volver a subir de plan la restaura tal cual se dejó.
- **Foto de perfil**: se sube de verdad al bucket privado `avatars` de Supabase
  Storage (siempre a la misma ruta por cuenta, así que subir una nueva
  reemplaza a la anterior sola) y se muestra con una URL firmada que vence a
  los 7 días y se renueva sola al volver a cargar la cuenta (ver `setAvatar`
  en `src/auth.js`). No hay recorte ni compresión todavía — para producción
  convendría redimensionarla antes de subirla.

## Cómo funciona el pago manual (transferencia bancaria o PayPal)

Los planes de paga (Premium y Premium Plus) ya no se cobran solos: se
activan a mano, por transferencia bancaria (México) o PayPal, coordinado
por fuera de la app. El flujo completo:

1. **Solicitar** (`paymentRequestSheet` en `src/views.js`, abierta desde
   `openPaymentRequest` en `src/app.js` al elegir Premium o Premium Plus en
   la hoja de planes): la persona elige cuántos meses quiere pagar (1 a 6, o
   1 año = 12), si prefiere transferencia o PayPal, y deja un número de
   celular. Al enviar, `requestManualPayment` (`src/auth.js`) inserta un
   renglón en `public.payment_requests` con `status: 'pendiente'` — una
   policy de RLS ("insert own") deja que cualquiera inserte la suya, nada
   más; nadie puede activarse un plan escribiendo directo en la base de
   datos. **El plan no cambia en este paso.**
   - Esta misma hoja también trae un botón **"Pagar vía WhatsApp"**,
     disponible desde que se abre (no hace falta elegir duración ni método
     primero) — abre una conversación de WhatsApp directo con el número del
     negocio, con un mensaje ya escrito diciendo qué plan quiere contratar
     (y, si ya eligió duración/método en esta misma hoja, los incluye
     también — ver `updateWhatsappLink` en `openPaymentRequest`,
     `src/app.js`). Es un camino más directo, en paralelo al de
     "Enviar solicitud": no reemplaza el flujo de arriba, ni inserta nada en
     `payment_requests` por sí solo — es la persona quien, ya en WhatsApp,
     decide si también deja la solicitud formal. Se configura con la
     variable de entorno `VITE_WHATSAPP_NUMBER` (formato internacional,
     solo dígitos — ver `pwa-app/.env.example`); sin ella, el botón
     simplemente no aparece (ver `WHATSAPP_NUMBER` en `src/store.js`).
2. **Contactar y cobrar**, por fuera de la app: quien administra el sitio ve
   la solicitud en su panel (sección "Solicitudes de pago", ver **"Cómo
   funciona el panel de administrador"**) con el nombre, correo y celular de
   quien la pidió, y le manda los datos de la cuenta bancaria o la liga de
   PayPal para pagar, por el medio que prefiera (WhatsApp, llamada, correo —
   Memoreo no automatiza esta parte).
3. **Activar**, una vez confirmado el pago: el administrador toca "Activar"
   en su panel, lo que abre una hoja (`adminActivateSheet` en
   `src/views.js`) donde elige cuántos meses activar — viene preseleccionada
   en los meses que la persona pidió originalmente, pero se puede cambiar
   antes de confirmar (por ejemplo si terminó pagando más o menos tiempo del
   que había pedido). Al confirmar, eso llama a
   `netlify/functions/admin-payment-requests.mjs` (acción `activate`), que
   sube `profiles.plan` al plan pedido y le pone `profiles.plan_expires_at`
   a hoy + los meses elegidos — o, si la cuenta ya tenía un plan de paga
   vigente, los meses se **suman** a partir de esa fecha en vez de reiniciar
   desde hoy, para que pagar por adelantado nunca haga perder tiempo ya
   pagado. La solicitud queda marcada `activado`, con cuándo, qué
   administrador la activó y hasta cuándo quedó vigente (columna
   "Vencimiento" en el panel, y también en la columna "Vence" de la tabla
   de Usuarios, por cuenta). "Cancelar" en cambio marca `cancelado` sin
   tocar el plan — para cuando el pago nunca se completó.
4. **Revertir**, si "Activar" se tocó por error: mientras la solicitud siga
   `activado`, el botón "Revertir" (acción `revert`) regresa el plan y el
   vencimiento de la cuenta a como estaban justo antes de esa activación
   (guardados en `previous_plan`/`previous_plan_expires_at` al activar), y
   la solicitud vuelve a `pendiente` para decidir de nuevo — con una nota de
   cuándo se revirtió (`reverted_at`), para que quede el rastro. Desde ahí
   se puede volver a tocar "Activar" y activarla de nuevo (con la misma
   hoja de elegir duración del punto 3, por si esta vez se quiere un número
   distinto de meses).
5. **Eliminar**, para limpiar la lista: el botón rojo (acción `delete`)
   borra el renglón de `payment_requests` para siempre, sin importar su
   estado. Es solo un borrado de la lista — no toca `profiles.plan` ni
   `plan_expires_at` de nadie, así que si la solicitud estaba `activado` esa
   cuenta sigue exactamente con el plan que tenía (si de verdad se quiere
   deshacer el plan, hay que usar "Revertir" primero, y luego eliminar si se
   quiere).
6. **Vencimiento — ya no es automático en la base de datos**: a diferencia
   de una versión anterior de esto, la cuenta NO se baja sola a Gratis en
   Supabase en cuanto pasa `plan_expires_at`. En vez de eso,
   `buildAccount()` (`src/auth.js`) calcula en el momento, sin escribir
   nada, si `plan_expires_at` ya pasó (`account.subscriptionExpired`) — y
   mientras sea así, `src/app.js` bloquea el resto de la app con una
   pantalla de "Tu suscripción venció" (`renewalRequiredView`, ver **"Qué
   pasa cuando vence una suscripción"** más abajo).

`payment_requests` (esquema completo en **"Base de datos real (Supabase)"**)
es una tabla nueva, separada de `profiles` — conserva un historial de todo
lo pedido, pagado o cancelado, salvo que el administrador elija eliminar
algún renglón a mano desde el panel (punto 5 de arriba).

## Qué pasa cuando vence una suscripción

Cuando el plan de paga de una cuenta vence (`plan_expires_at` ya pasó,
ver el punto 6 de arriba) la persona ya no puede seguir usando Memoreo
normalmente: en cuanto abre la app (o la siguiente vez que `render()`
vuelve a pintar la pantalla), ve una pantalla que reemplaza TODA la app —
sin acceso a inicio, documentos, avisos ni perfil — con dos caminos hacia
adelante:

- **"Renovar suscripción"** abre la misma hoja de solicitar pago de
  siempre (`paymentRequestSheet`) — al pedir un plan de nuevo, queda otra
  solicitud pendiente esperando a que el administrador la active, igual que
  la primera vez.
- **"Ya pagué — actualizar"** vuelve a preguntarle a Supabase por la cuenta,
  por si el administrador ya activó la renovación desde su panel — si ya se
  activó, la pantalla de bloqueo desaparece sola.
- **"Continuar con Plan Gratis"** es la salida instantánea y sin costo, para
  quien no quiere renovar: baja el plan a Gratis (y limpia
  `plan_expires_at`) al toque, sin tener que esperar a nadie.

A propósito NO es un candado sin salida — la idea es que nadie siga usando
un plan de paga vencido sin darse cuenta (que era el problema con la
versión anterior, donde la cuenta bajaba sola y en silencio a Gratis), pero
tampoco dejar a alguien con su cuenta secuestrada si ya no quiere pagar.
Los documentos de la cuenta nunca se tocan ni se pierden mientras dura el
bloqueo — están ahí en cuanto se renueva o se pasa a Gratis.

## Cómo funciona el pago con Stripe (modo prueba, sin usar actualmente)

*Esta sección documenta el sistema de cobro automático de una versión
anterior. El código (`src/stripeClient.js`, `applyStripeSubscription`,
`netlify/functions/create-checkout-session.mjs` y las demás funciones de
pago, `/server`) sigue en el proyecto tal cual, pero ninguna pantalla actual
lo llama — la hoja de planes ahora abre el flujo de pago manual de arriba.
Se conserva por si se quiere retomar el cobro automático más adelante.*

Cuentas, documentos, recordatorios y personalización ya son reales de punta
a punta (ver las secciones de arriba) — y los planes de paga también: sí
procesan un cobro real con **Stripe, en modo prueba**. Eso significa que
esta parte del proyecto ya no es solo `pwa-app`: necesita un backend,
porque la llave secreta de Stripe nunca puede vivir en el navegador. Hay
**dos backends equivalentes** entre los que elegir — mismo comportamiento,
mismos endpoints (`/api/create-checkout-session`, `/api/checkout-status`,
`/api/create-portal-session`, `/api/subscription-status`, `/api/webhook`),
así que `src/stripeClient.js` no necesita saber cuál de los dos está corriendo:

- **`pwa-app/netlify/functions/`** — cinco funciones de Netlify (una por
  endpoint). Es la opción recomendada si vas a publicar el sitio en Netlify
  (ver **"Desplegar en Netlify"** más abajo): no hay un segundo servidor que
  mantener corriendo por separado, todo vive en el mismo despliegue.
- **`/server`** — el mismo backend como un servidor Express independiente.
  Útil si prefieres correrlo tú mismo, desplegarlo en otro lado (Render,
  Railway, un VPS), o simplemente no quieres instalar la Netlify CLI.

### Por qué hace falta un backend

Aunque la cuenta ya vive en una base de datos real (ver **"Base de datos
real (Supabase)"**), "Premium Plus se habilita solo cuando se cobra" solo se
puede garantizar de verdad si algo que el usuario no controla (el
navegador) verifica el cobro con Stripe — la llave secreta de Stripe nunca
puede vivir en el navegador. Por eso existe este backend (en
cualquiera de sus dos formas): crea la sesión de pago con la llave secreta,
y cuando el navegador vuelve, es el propio backend quien le pregunta a
Stripe (no le pregunta al navegador) si de verdad hubo un cobro antes de
dar luz verde a activar el plan. Ver `applyStripeSubscription` en
`src/auth.js` — es el único lugar de todo el proyecto donde un plan de paga
se activa, y solo se llama después de esa confirmación
(`handleCheckoutReturn` en `src/app.js`).

### Configurar Stripe (una sola vez, sin importar qué backend elijas)

1. Crea una cuenta gratis en [stripe.com](https://stripe.com) y quédate en
   **modo prueba** (el interruptor "Test mode" del dashboard) — con esto
   nunca se puede cobrar dinero real, sin importar qué tarjeta se use.
2. En el dashboard, **Product catalog**, crea dos productos recurrentes:
   "Memoreo Premium" ($59 MXN/mes) y "Memoreo Premium Plus" ($99 MXN/mes).
   Copia el ID de cada **Price** (empieza con `price_...`, no el del
   producto).
3. En **Developers → API keys**, copia la "Secret key" de modo prueba
   (`sk_test_...`).
4. Para el webhook (`STRIPE_WEBHOOK_SECRET`): en desarrollo local, instala el
   [Stripe CLI](https://docs.stripe.com/stripe-cli) y corre
   `stripe listen --forward-to localhost:8888/api/webhook` (funciones de
   Netlify vía `netlify dev`) o `stripe listen --forward-to
   localhost:4242/api/webhook` (servidor Express) — imprime un `whsec_...`.
   Una vez desplegado de verdad en Netlify, ese webhook se configura distinto
   (ver **"Desplegar en Netlify"**).

### Correrlo en local

**Opción A — funciones de Netlify** (recomendada; un solo comando):

```bash
cd pwa-app
npm install
npm install -g netlify-cli   # una sola vez
cp .env.example .env         # llena las 4 variables de Stripe del paso anterior
netlify dev
```

`netlify dev` levanta Vite y las funciones juntos en `http://localhost:8888`
(no `5173`) — ábrelo ahí para que `/api/...` funcione.

**Opción B — servidor Express independiente:**

```bash
# Terminal 1 — el backend de pagos
cd server
npm install
cp .env.example .env   # llena STRIPE_... aquí en vez de en pwa-app/.env
npm start

# Terminal 2 — el PWA
cd pwa-app
echo "VITE_API_BASE=http://localhost:4242" > .env
npm run dev
```

Con cualquiera de las dos opciones corriendo, "Elegir Premium" / "Probar
gratis 7 días" / "Elegir Premium Plus" en la hoja de planes redirige de
verdad a una página de Stripe Checkout. Usa la tarjeta de prueba
`4242 4242 4242 4242`, cualquier fecha futura y cualquier CVV — Stripe la
acepta siempre en modo prueba, sin cobrar nada real. Si el backend no está
corriendo, el botón muestra un error claro en vez de fallar en silencio.

### El flujo, paso a paso

- **Elegir un plan de paga** llama a `startCheckout` (`src/stripeClient.js`),
  que le pide al backend una sesión de Stripe Checkout y redirige el
  navegador ahí — **el plan no cambia en este paso**. Premium incluye
  `trial_period_days: 7` la primera vez que una cuenta lo usa (`trialUsed`
  en la cuenta evita repetirlo — ya lo controla Stripe, no una fecha
  guardada a mano); Premium Plus y un Premium fuera de la prueba cobran de
  inmediato.
- **Al volver de Stripe** (`?checkout=success&session_id=...` en la URL),
  `handleCheckoutReturn` en `src/app.js` le pregunta al backend
  (`/api/checkout-status`) si esa sesión de verdad se pagó o empezó una
  prueba. Solo si la respuesta es sí, se llama `applyStripeSubscription` y
  el plan se activa — guardando también la marca y últimos 4 dígitos de la
  tarjeta que Stripe reporta (nunca el número completo) y el
  `stripeCustomerId`/`stripeSubscriptionId` para los dos puntos siguientes.
  Si se cancela el pago en Stripe, vuelve con `?checkout=cancelled` y el
  plan simplemente no cambia.
- **Perfil** sigue mostrando la misma tarjeta ámbar de "quedan N días" que
  antes durante la prueba (`trialInfo` en `src/utils.js`, sin cambios) —
  solo que ahora `trialEndsAt` viene de lo que Stripe reportó, no de
  `hoy + 7 días` calculado a mano.
- **Cancelar** ("Cancelar en Stripe" en Perfil, cuando la cuenta ya tiene un
  `stripeCustomerId`) abre el **Billing Portal** de Stripe — cancelar o
  cambiar de tarjeta de verdad vive ahí, no en una hoja propia de Memoreo.
  Al volver (`?portal=return`), se vuelve a preguntar a Stripe el estado
  real de la suscripción (`/api/subscription-status`) y se sincroniza la
  cuenta local — si se canceló, baja a Gratis.
- **La cuenta demo** (`startDemoSession` en `src/auth.js`) es la única
  excepción: se siembra directamente en una prueba activa con
  `startPremiumTrial`, sin pasar por Stripe, para que la función se vea de
  inmediato sin tener que configurar nada. Una cuenta real nunca pasa por
  esa función.
- **El webhook** (`netlify/functions/webhook.mjs`) recibe
  `checkout.session.completed` y `customer.subscription.updated/deleted`
  directamente de Stripe, y actualiza el plan **de verdad, en la base de
  datos** (`public.profiles`, con la llave service_role) en cuanto Stripe lo
  confirma — así queda correcto tanto para esa persona como para el panel de
  administrador aunque el cambio no haya pasado por su navegador (por
  ejemplo, cancelar la suscripción directamente desde el dashboard de
  Stripe, o una renovación que falla). A propósito nunca crea un perfil
  nuevo ahí — solo actualiza uno que ya existía (los perfiles nuevos solo
  los crea el trigger de la base de datos al registrarse, ver **"Base de
  datos real (Supabase)"**).

### Sobre la verificación del lado del servidor

A diferencia de una versión sin base de datos, aquí el `accountId` que
decide qué cuenta se actualiza sí está protegido: `applyStripeSubscription`
y las demás funciones de `src/auth.js` escriben en `public.profiles` con la
llave pública de Supabase, autenticada con la sesión de quien inició sesión
— y Row Level Security (ver **"Base de datos real (Supabase)"**) impide que
esa escritura toque el perfil de cualquier otra cuenta, sin importar qué
`accountId` mande el navegador.

## Cómo funciona el panel de administrador

No es una página aparte ni tiene su propia URL: se entra escribiendo el
usuario y la contraseña de administrador en el mismo formulario de
"Iniciar sesión" que usa cualquier cuenta, desde la pantalla de bienvenida
de Memoreo. Si lo que se escribió no es una cuenta normal, la app prueba
en silencio si es el usuario y la contraseña de administrador antes de
mostrar el error de siempre — si acierta, entra directo al panel de
métricas en vez de a la app; si no, nadie nota que lo intentó. Es para
quien administra el sitio, no para las personas que lo usan, y se ve quién
se ha registrado de verdad y en qué plan está cada quien sin importar
desde qué dispositivo entres: tu laptop o el navegador del celular, ambos
ven lo mismo, porque los datos viven en la base de datos compartida
(Supabase), no en cada navegador.

**Qué guarda y qué no:** `netlify/functions/admin-metrics.mjs` lee directo
de `public.profiles` (nombre, plan, fechas) cruzado con el correo de
Supabase Auth, usando la llave service_role — no hay ningún paso intermedio
que "avise" de una cuenta nueva, porque el perfil ya existe ahí en cuanto
alguien se registra (ver **"Base de datos real (Supabase)"**). Nunca se lee
ni se manda la contraseña ni ningún documento — el panel está pensado para
responder "¿cuánta gente se ha registrado y qué plan eligieron?", no para
ver el contenido de nadie.

**Vence, por cuenta:** la tabla de Usuarios y métricas trae una columna
"Vence" con la fecha hasta la que queda vigente el plan de paga de cada
quien (en rojo si ya pasó) — "—" para Plan Gratis o para quien nunca ha
tenido un plan de paga. Viene de `profiles.plan_expires_at`, el mismo dato
que decide si esa cuenta ve la pantalla de "Tu suscripción venció" (ver
**"Qué pasa cuando vence una suscripción"** más arriba).

**Solicitudes de pago:** debajo de la tabla de usuarios hay una segunda
sección, "Solicitudes de pago" — lo que llega cada vez que alguien pide
Premium o Premium Plus por transferencia bancaria o PayPal (ver **"Cómo
funciona el pago manual"** más arriba). Cada renglón trae el celular para
contactar, cuántos meses y con qué método; las que siguen "Pendiente"
tienen botones **Activar** (abre una hoja para elegir cuántos meses activar
— preseleccionada en los meses pedidos, pero se puede cambiar — y sube el
plan de esa cuenta con esa duración, solo después de confirmar que el pago
de verdad llegó), **Cancelar** (si nunca se completó) y un botón rojo para
**eliminar** el renglón de la lista para siempre. Una vez activada, la
columna "Vencimiento" muestra hasta cuándo queda vigente ese plan, y el
botón cambia a **Revertir** por si "Activar" se tocó por error — deshace
exactamente esa activación (el plan y el vencimiento vuelven a como estaban
antes) y la solicitud regresa a "Pendiente" para decidir de nuevo, desde
donde se puede volver a activar (con la misma hoja de elegir duración, por
si esta vez se quiere un número distinto de meses). El botón de eliminar
sigue disponible en cualquier estado — solo quita el renglón de la lista,
nunca cambia el plan de la cuenta (para eso hace falta "Revertir" primero).
Todo esto lo maneja `netlify/functions/admin-payment-requests.mjs`, con la
misma llave service_role y la misma cortina de usuario/contraseña que
`admin-metrics.mjs`.

**Requiere el despliegue en Netlify — no el servidor Express de `/server`.**
Las funciones de Netlify son las que tienen acceso a la llave service_role
de Supabase (`SUPABASE_SERVICE_ROLE_KEY`, configurada como variable de
entorno de Netlify — ver **"Base de datos real (Supabase)"**); el servidor
Express independiente (ver **"Cómo funciona el pago con Stripe"** más
arriba) no la trae configurada, así que ahí `/api/admin-metrics` no existe.
Si quieres el panel de administrador, usa `netlify/functions/` como backend
(que de todas formas es la opción recomendada — ver **"Desplegar en
Netlify"** abajo).

### Configurarlo

1. Elige un usuario y una contraseña, y agrégalos como `ADMIN_USERNAME` y
   `ADMIN_PASSWORD` — en `pwa-app/.env` si vas a probar con `netlify dev`
   en local, o como variables de entorno en Netlify una vez desplegado (ver
   **"2. Configurar Stripe y el panel de administrador en Netlify"**
   abajo, donde también van estas).
2. Abre Memoreo (por ejemplo `http://localhost:8888/` en local, o
   `https://tu-sitio.netlify.app/` ya desplegado), toca "Iniciar sesión" en
   la pantalla de bienvenida y escribe ese usuario y esa contraseña en los
   mismos campos de correo y contraseña — no hay que entrar por ningún
   otro lado ni recordar una URL aparte.

Sin `ADMIN_USERNAME` y `ADMIN_PASSWORD` configuradas (y sin que nunca se
haya usado "Cambiar contraseña" — ver abajo), `/api/admin-metrics` responde
con un error claro en vez de dejar entrar a cualquiera.

### Cambiar la contraseña desde el propio panel

El botón "Cambiar contraseña" en la barra superior del panel (junto a
"Actualizar") pide la contraseña actual y la nueva, y la guarda con hash
(nunca en texto plano) en `public.admin_credentials` — una tabla nueva de
un solo renglón, protegida con Row Level Security sin ninguna policy, así
que solo las funciones de Netlify (con la llave service_role) pueden
leerla o escribirla, nunca el navegador. En cuanto se cambia una vez, esa
contraseña **manda sobre** `ADMIN_USERNAME`/`ADMIN_PASSWORD` — las
variables de entorno solo se siguen usando mientras `admin_credentials`
esté vacía (`checkAdminAuth` en `netlify/functions/_shared.mjs`), así que
un sitio recién desplegado sigue funcionando con ellas tal cual siempre,
sin tener que tocar nada primero.

### La cortina de seguridad, honestamente

Esto es un usuario y una contraseña (con hash desde que existe "Cambiar
contraseña"; en tiempo constante también al compararlos —
`checkAdminAuth` en `_shared.mjs`, para no filtrar por cuánto tarda la
respuesta si alguien está adivinando), no un sistema de autenticación
completo: sigue siendo un solo usuario-administrador (el que tú definas),
sin tokens que expiren ni límite de intentos. Es apropiado para un
prototipo que solo tú vas a usar; para un panel que abrieran varias
personas de tu equipo, cada quien con su propia cuenta, convendría moverlo
a algo como lo descrito en **"Siguiente paso: backend
real"** (autenticación real con Supabase o Firebase) en vez de una sola
contraseña compartida.

## Desplegar en Netlify

Netlify hospeda el sitio (`pwa-app/dist`) gratis en un subdominio propio
(`tu-sitio.netlify.app`) y, con las funciones de `netlify/functions/`, el
pago con Stripe también corre ahí — no hace falta un segundo servidor en
ningún lado.

**Checklist antes de anunciar el sitio a alguien más** (todo lo demás en
esta sección explica cada paso):

- [ ] `npm run build` corre sin errores (`npm run build` en `pwa-app/`).
- [ ] El sitio está desplegado en Netlify con **Base directory** `pwa-app`,
      **Publish directory** `pwa-app/dist` (paso 1 abajo).
- [ ] Corriste `supabase/schema.sql` en tu proyecto de Supabase, y
      `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `SUPABASE_URL` y
      `SUPABASE_SERVICE_ROLE_KEY` están configuradas — sin esto nadie puede
      registrarse, iniciar sesión ni guardar nada (ver **"Base de datos real
      (Supabase)"**).
- [ ] `STRIPE_SECRET_KEY`, `STRIPE_PRICE_PREMIUM` y
      `STRIPE_PRICE_PREMIUM_PLUS` configuradas — sin esto los planes de
      paga responden con un error claro en vez de romperse (paso 2 abajo).
- [ ] El webhook de Stripe apunta a `https://tu-sitio.netlify.app/api/webhook`
      y `STRIPE_WEBHOOK_SECRET` es el que Stripe dio para *ese* endpoint,
      no el del Stripe CLI local (paso 2, punto 3).
- [ ] `ADMIN_USERNAME` y `ADMIN_PASSWORD` elegidas y configuradas — son las
      credenciales para entrar al panel desde el mismo "Iniciar sesión"
      (ver **"Cómo funciona el panel de administrador"**).
- [ ] `VITE_WHATSAPP_NUMBER` configurada con tu número real, si quieres el
      botón "Pagar vía WhatsApp" en la hoja de solicitar un plan (ver
      **"Cómo funciona el pago manual"**) — opcional: sin ella el botón
      simplemente no aparece, el resto del flujo de pago sigue igual.
- [ ] Volviste a desplegar (**Deploys → Trigger deploy**) después de
      agregar o cambiar variables de entorno — no se aplican solas a un
      deploy ya hecho.
- [ ] Probaste pagar con la tarjeta de prueba de Stripe
      (`4242 4242 4242 4242`) ya en la URL pública, no solo en local.

Con eso el sitio queda funcionando de verdad, no como una demostración: los
pagos activan planes reales vía Stripe y el panel de administrador muestra
cuentas reales.

### 1. Publicar el sitio

**Con Git (recomendada — cada `git push` vuelve a desplegar solo):**

1. Sube este proyecto a un repositorio de GitHub, GitLab o Bitbucket.
2. En [app.netlify.com](https://app.netlify.com), crea una cuenta gratis →
   "Add new site" → "Import an existing project" → conecta ese repositorio.
3. Cuando pida la configuración del sitio:
   - **Base directory**: `pwa-app`
   - **Build command**: `npm run build` (ya viene en `netlify.toml`, Netlify
     lo detecta solo)
   - **Publish directory**: `pwa-app/dist`
4. "Deploy site". En un par de minutos tu app queda en algo como
   `https://nombre-al-azar.netlify.app` — ese es tu dominio gratis. Puedes
   cambiar ese nombre en **Site configuration → Domain management → Options
   → Edit site name**.

**Sin Git, con la CLI (para probar rápido sin subir el código a ningún lado):**

```bash
cd pwa-app
npm run build
npm install -g netlify-cli   # si no la instalaste antes
netlify deploy --prod
```

La CLI pregunta si quieres crear un sitio nuevo o usar uno existente, y al
final imprime la URL pública.

**Sobre "dominio gratis":** lo que Netlify da gratis es ese subdominio
`.netlify.app` (con HTTPS incluido) — es un dominio real y funciona
perfecto para un prototipo o para compartir con quien quieras. Si más
adelante quieres algo como `memoreo.com` en vez de `memoreo.netlify.app`,
el dominio en sí hay que comprarlo en un registrador (Namecheap, Cloudflare,
etc. — unos cuantos dólares al año); conectarlo a Netlify y el certificado
HTTPS para ese dominio propio sí siguen siendo gratis (**Domain
management → Add a domain**).

### 2. Configurar Stripe y el panel de administrador en Netlify

1. En el dashboard del sitio: **Project configuration → Environment
   variables → Add a variable**. Agrega las mismas variables que usaste en
   local: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `SUPABASE_URL`,
   `SUPABASE_SERVICE_ROLE_KEY` (ver **"Base de datos real (Supabase)"**),
   `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`,
   `STRIPE_PRICE_PREMIUM`, `STRIPE_PRICE_PREMIUM_PLUS`,
   `ADMIN_USERNAME`, `ADMIN_PASSWORD` (ver **"Cómo funciona el panel de
   administrador"** más arriba) y, si quieres el botón "Pagar vía
   WhatsApp", `VITE_WHATSAPP_NUMBER` (ver **"Cómo funciona el pago
   manual"**).
2. Vuelve a desplegar (**Deploys → Trigger deploy**) para que las funciones
   tomen las variables nuevas — no se aplican solas a un deploy ya hecho.
3. En el dashboard de Stripe, **Developers → Webhooks → Add endpoint**, usa
   `https://tu-sitio.netlify.app/api/webhook` como URL y selecciona al menos
   `checkout.session.completed`, `customer.subscription.updated` y
   `customer.subscription.deleted`. Stripe te da un `whsec_...` nuevo,
   específico para este endpoint — actualiza `STRIPE_WEBHOOK_SECRET` en
   Netlify con ese (no el que te dio el Stripe CLI en local, que es distinto)
   y vuelve a desplegar.

Con eso, entrar a `https://tu-sitio.netlify.app`, tocar "Probar gratis 7
días" o cualquier plan de paga, y pagar con la tarjeta de prueba
`4242 4242 4242 4242` activa el plan de verdad — mismo flujo que en local,
ya en una URL que puedes compartir.

## Base de datos real (Supabase)

Cuentas, documentos y archivos adjuntos viven en un proyecto de
[Supabase](https://supabase.com) — Postgres administrado, con Auth (cuentas)
y Storage (archivos) incluidos en el mismo proyecto, en su capa gratuita
alcanza sobrado para validar el producto con más de 100 cuentas registradas
y su información (el límite de la capa gratuita es 500 MB de base de datos y
1 GB de Storage — cientos de miles de documentos de solo texto, o unos
cuantos miles si la mayoría trae foto/PDF adjunto; subir de plan en Supabase
es cosa de un clic si se necesita más adelante, sin tocar código).

### Configurar tu proyecto (una sola vez)

1. Crea una cuenta gratis en [supabase.com](https://supabase.com) → "New
   project". Elige una contraseña para la base de datos y guárdala aparte
   (es la que usarías para conectarte con `psql` directo; la app nunca la
   necesita).
2. En tu proyecto, abre **SQL Editor**, pega el contenido completo de
   `pwa-app/supabase/schema.sql` y dale **Run**. Esto crea las tablas
   `profiles`, `documents`, `payment_requests` y `admin_credentials`, activa
   Row Level Security con las políticas de "cada quien ve y edita solo lo
   suyo", y crea los dos buckets privados de Storage (`attachments` y
   `avatars`) con sus propias políticas de acceso. Es seguro volver a
   correrlo si algo falla a medias — incluso si ya tenías un proyecto viejo
   sin `payment_requests`, sus columnas de "Revertir" o
   `profiles.plan_expires_at`, correr el archivo de nuevo los agrega solos.
   **Si ya tenías un proyecto de Supabase de una versión anterior de
   Memoreo (antes de que Hogar tuviera Documentos/Servicios/Mantenimiento),
   sí hace falta volver a correr `schema.sql` esta vez**: además de agregar
   columnas que falten, ensancha una restricción (`documents_kind_check`)
   que antes solo aceptaba `kind` en `'doc'`/`'activity'` — sin eso, guardar
   un Documento o Servicio nuevo de Hogar fallaría. Los documentos ya
   guardados no se tocan ni se pierden.
3. En **Project Settings → API**, copia:
   - **Project URL** → es el valor de `VITE_SUPABASE_URL` y `SUPABASE_URL`
     (el mismo valor, en dos variables distintas).
   - **anon / public key** → `VITE_SUPABASE_ANON_KEY`. No es secreta: está
     pensada para usarse desde el navegador, la seguridad real la dan las
     políticas de Row Level Security del paso 2, no ocultar esta llave.
   - **service_role key** → `SUPABASE_SERVICE_ROLE_KEY`. Esta sí es secreta
     de verdad: ignora Row Level Security por completo. Solo se usa del
     lado del servidor (`netlify/functions/admin-metrics.mjs`,
     `delete-account.mjs` y `webhook.mjs` — ver `_shared.mjs`), nunca en
     código que corre en el navegador, y nunca debe llevar el prefijo
     `VITE_` (eso la mandaría al navegador) ni guardarse en un archivo que
     se suba a un repositorio.
4. Agrega las cuatro variables (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`,
   `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`) en `pwa-app/.env` para
   probar en local con `netlify dev`, y como variables de entorno del sitio
   en Netlify para producción (ver **"2. Configurar Stripe y el
   panel de administrador en Netlify"** — ahí también van estas cuatro).
5. Decide sobre la confirmación por correo al registrarse — ver la nota al
   final de **"Cómo funcionan las cuentas hoy"** más arriba. Por defecto
   Supabase la exige; si prefieres el alta instantánea de siempre,
   desactívala en **Authentication → Providers → Email**.

### Cómo está armado

- **`public.profiles`** — un renglón por cuenta (nombre, plan,
  `plan_expires_at`, color, datos de Stripe sin usar, preferencias de
  notificación), ligado 1 a 1 a `auth.users` por el mismo id. Un trigger de
  la base de datos (`handle_new_user`) crea este renglón solo, en el mismo
  instante en que alguien se registra — nada en el código de la app tiene
  que acordarse de crearlo.
- **`public.documents`** — un renglón por documento/pago/préstamo/registro
  de salud, con `user_id` apuntando a quién es. Row Level Security compara
  ese `user_id` contra `auth.uid()` (quién inició sesión) en cada
  select/insert/update/delete — es la base de datos, no el código de
  `src/store.js`, quien de verdad impide que una cuenta vea o modifique los
  documentos de otra.
- **`public.payment_requests`** — un renglón por solicitud de pago manual
  (transferencia bancaria o PayPal, ver **"Cómo funciona el pago
  manual"**): plan, meses, método, celular y estado
  (`pendiente`/`activado`/`cancelado`), más `expires_at`/`previous_plan`/
  `previous_plan_expires_at` (lo que "Activar" calculó y lo que había antes
  — lo que necesita "Revertir" para deshacerlo) y `reverted_at`. Cada quien
  puede insertar y ver las suyas (RLS), pero solo el panel de administrador
  (con la llave service_role, que ignora RLS) puede cambiar el estado — así
  nadie puede activarse un plan a sí mismo.
- **`public.admin_credentials`** — un solo renglón (usuario + contraseña con
  hash) para "Cambiar contraseña" en el panel de administrador — ver **"Cómo
  funciona el panel de administrador"**. Row Level Security sin ninguna
  policy: ni siquiera una cuenta con sesión iniciada puede tocar esta tabla
  desde el navegador, solo las funciones de Netlify.
- **Storage** — dos buckets **privados** (`attachments` para fotos/PDFs de
  documentos, `avatars` para fotos de perfil), con la misma idea de Row
  Level Security aplicada a archivos: cada archivo vive bajo una ruta que
  empieza con el id de su dueño (`<accountId>/...`), y una política impide
  leer o escribir fuera de la propia carpeta. Como los buckets son
  privados, ver una foto o un PDF adjunto pasa por una **URL firmada**
  (vence en 7 días, se genera de nuevo sola cada vez que se abre la cuenta
  o se sube/edita un documento) en vez de una URL pública fija — así
  arreglamos también el error de que los archivos adjuntos no se podían
  ver: ahora una foto se muestra en la portada del documento y se puede
  abrir a tamaño completo, y un PDF adjunto tiene su propio botón de "Ver
  PDF adjunto".
- **Patrón de caché en memoria** (`src/store.js`): los documentos de la
  cuenta activa se cargan una vez a memoria al iniciar sesión, junto con
  las URLs firmadas de sus adjuntos; leer (`store.all()`, `store.get()`)
  sigue siendo instantáneo como antes, y solo guardar/editar/eliminar habla
  con Supabase.
- **Borrar una cuenta** (Perfil → Seguridad y privacidad) pasa por
  `netlify/functions/delete-account.mjs`, la única operación que necesita
  la llave service_role del lado del cliente: verifica con el propio token
  de sesión que quien pide el borrado es dueño de esa cuenta, borra sus
  archivos de Storage, y borra la cuenta de Supabase Auth — el perfil y
  todos sus documentos se van solos por la relación `on delete cascade` del
  esquema.

### Recordatorios automáticos

Hoy los recordatorios son "bajo demanda": hay que abrir la app para ver la
pantalla de Recordatorios y su semaforización por urgencia. No hay envío de
correo — decisión deliberada, no se va a usar. Para avisar sin que nadie
abra la app (una notificación push del navegador el día que corresponde)
haría falta una función programada del lado del servidor (un Netlify
Scheduled Function, por ejemplo) que consulte `public.documents` por
vencimientos próximos y dispare la notificación sola — con la base de datos
real ya en su lugar, esto es agregar esa función; ya no falta nada más para
que sea posible.

## Siguientes pasos hacia producción

Con cuentas, documentos y pagos ya reales, lo que queda para un lanzamiento
de verdad:

- **Recordatorios automáticos** — ver el punto justo arriba.
- **Llaves de producción (live) de Stripe y dominio con HTTPS real** — el
  modo prueba de Stripe (ya conectado, ver **"Cómo funciona el pago con
  Stripe"**) nunca debe combinarse con datos o cuentas reales; cambiar a
  llaves `live` es el último paso antes de cobrar de verdad.
- **Redimensionar imágenes antes de subirlas** (fotos de documentos y de
  perfil) — hoy se suben tal cual las entrega la cámara/selector de
  archivos del celular, sin comprimir.

Al evaluar Stripe contra PayPal para este caso — tarjeta como método
principal, cobro recurrente automático y prueba gratis — Stripe salió
como la mejor opción de las dos, por eso es lo que ya está conectado:

- **Tarifas**: Stripe cobra 2.9% + $0.30 por transacción y Stripe Billing
  no tiene costo mensual fijo, solo 0.7% adicional sobre el volumen
  recurrente. PayPal cobra alrededor de 3.49% + $0.49 por transacción —
  más caro en todos los volúmenes — y sus planes antiguos de cobro
  recurrente ("Enhanced Recurring Payments") agregan $10–30/mes extra si
  no se tiene cuidado de evitarlos.
- **Prueba gratis y cobro recurrente**: Stripe Billing tiene soporte
  nativo para periodos de prueba (`trial_period_days`, ya en uso) y
  reintentos automáticos de cobro cuando una renovación falla (Smart
  Retries). La documentación de PayPal para este mismo patrón es menos
  madura.
- **Experiencia de pago**: Stripe Checkout puede quedarse embebido dentro
  de la propia app (con Payment Element) en vez de una redirección,
  mientras que PayPal generalmente redirige a una página o ventana
  emergente con su propia marca, a menos que se pague por PayPal Payments
  Pro (~$30/mes) para personalizarlo. Esta integración usa la versión más
  simple de Stripe (Checkout hospedado por Stripe) porque no necesita
  manejar tarjetas directamente ni cumplir PCI por su cuenta.
- Stripe además opera en México con contrato local, relevante para el
  público de esta app.

Recomendación: usar Stripe como procesador principal; PayPal se podría
ofrecer más adelante como opción secundaria para quien lo prefiera, pero
no como único método dado el requisito de renovación automática.

## Notas de diseño

Paleta y tipografía comparten identidad con la demo visual: turquesa profundo
(`#0EA5A6`) como color de marca, con magenta frambuesa (`#C71368` en texto,
más brillante en modo oscuro) como acento para llamadas a la atención — una
identidad deliberadamente audaz, pensada para verse como una app de 2026 y no
como una versión "segura" de un azul corporativo, sobre un fondo neutro
violeta-frío en vez de tonos "papel". Cada categoría tiene su propio color
(personal en turquesa de marca, garantías en magenta, seguros en azul,
vehículo en violeta, hogar en rojo-naranja, estudios en dorado, pagos en
índigo, préstamos en verde, salud en rojo) para que se reconozcan de un
vistazo; un registro de Mantenimiento dentro de Vehículo u Hogar usa el mismo
color de esa categoría, ya que ahora vive genuinamente dentro de ella en vez
de tomarlo prestado de una categoría aparte.
Tipografía: Bricolage Grotesque en pesos extra-bold para títulos (una display
con más carácter y menos aspecto de plantilla) y Hanken Grotesk para el resto
de la interfaz, e IBM Plex Mono para fechas y contadores (alineación tabular,
sensación técnica/precisa).

El layout de escritorio (`@media (min-width: 900px)` en `style.css`) reutiliza
exactamente la misma barra de navegación: en vez de duplicar componentes, la
barra inferior de pulgar se convierte en un riel lateral fijo con los mismos
botones, y el botón "Agregar" pasa de FAB circular a un botón de ancho completo
en la parte superior del riel — mismo estado, mismo HTML, solo otra disposición
en CSS.
