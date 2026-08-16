# Familia Rojiblanca 26/27

Concurso de alineaciones del Sevilla FC. Cada participante publica su once antes
del partido y puntúa según los jugadores que acierte del once inicial real.

| Aciertos | 11 | 10 | 9 | 8 | 7 | 6 | ≤5 |
|---|---|---|---|---|---|---|---|
| Puntos | 100 | 50 | 25 | 10 | 5 | 1 | 0 |

## Puesta en marcha

### 1. Supabase (la base de datos) — HECHO ✅

Proyecto creado, los tres scripts SQL ejecutados y `app/config.js` relleno.
Comprobado: la web lee los 6 participantes, los 23 jugadores y la jornada 1, y
las tablas **no** son accesibles con la clave pública.

Si algún día hay que rehacerlo: crear el proyecto en <https://supabase.com>,
ejecutar en el **SQL Editor** los ficheros `sql/01_esquema.sql`, `sql/02_api.sql`,
`sql/03_datos.sql` y `sql/04_calendario.sql` **en ese orden**, y copiar en
`app/config.js` la *Project URL* y la clave `anon public` de
**Project Settings → API**.

### 1 bis. El calendario de las 38 jornadas

`sql/04_calendario.sql` carga el calendario entero del sorteo de LaLiga 26/27.
Se puede ejecutar sobre la base de datos que ya está funcionando y **no pisa
nada**: las jornadas que ya existan las deja como están.

El **día** de cada partido es el del calendario oficial. La **hora** todavía no
la ha fijado LaLiga (la publica unas semanas antes), así que va una tentativa de
las 21:00 y la jornada queda marcada como *hora sin confirmar*: la web lo avisa
con un distintivo amarillo y una nota, tanto a los participantes como a ti.

Cuando se sepa la hora de verdad: **Admin → Editar** en esa jornada → corriges
día y hora y marcas **«hora oficial»**. El cierre se recalcula solo. Mientras la
jornada que toca siga sin hora confirmada, el panel de Admin te lo recuerda
arriba del todo.

> La clave `anon` es pública por diseño: va dentro de la web. La seguridad no
> depende de ella — todas las tablas están bloqueadas y solo se puede operar a
> través de las funciones controladas de `sql/02_api.sql`, que comprueban el PIN
> y la hora de cierre en el servidor.

### 1 ter. Que el SQL se aplique solo (así no hay que pegar nada nunca más)

`.github/workflows/aplicar-sql.yml` hace que **cada vez que se suba un cambio
dentro de `sql/`, GitHub lo aplique a Supabase automáticamente**. Ejecuta en
orden `sql/01_…`, `02_…`, `03_…`, `04_…`; deja fuera la autoprueba a propósito.
Cada ejecución queda registrada en la pestaña **Actions** del repositorio, con su
fecha, su resultado y la lista de ficheros aplicados.

Repetirlo no rompe nada: los scripts están escritos para poder volver a lanzarse
sin duplicar datos ni pisar lo corregido desde Admin, y cada fichero va dentro de
una transacción (si algo falla, ese fichero se deshace entero).

**Se configura una sola vez, y hay que hacerlo a mano** porque implica una
contraseña:

1. En **Supabase**, botón **Connect** (arriba). Busca **Session pooler** y copia
   la cadena que empieza por `postgresql://`. Tiene que ser la del *Session
   pooler*: la conexión directa a la base de datos no funciona desde GitHub.
2. Esa cadena lleva un `[YOUR-PASSWORD]` que hay que sustituir por la contraseña
   de la base de datos. **No es la de tu cuenta de Supabase** (si entras con
   GitHub, ni siquiera tienes una): es la del usuario `postgres` del proyecto, y
   solo se enseña al crearlo. Si no la guardaste, no se puede consultar; hay que
   generar una nueva. Está en la sección **Database** del menú lateral →
   **Settings** (al final de ese apartado), botón *Reset database password*.
   Ojo: **no** está en *Project Settings*, que es donde uno lo buscaría —
   la dirección es `/dashboard/project/<tu-proyecto>/database/settings`.
   Cópiala en ese momento, porque tampoco se vuelve a mostrar.

   Cambiarla es seguro: Supabase actualiza solo sus propios servicios y no hay
   corte. La web no se entera, porque funciona con la clave `anon`, que es otra
   cosa distinta y no se toca.
3. En **GitHub**, en el repositorio: **Settings → Secrets and variables →
   Actions → New repository secret**. Nombre exacto: `SUPABASE_DB_URL`. Valor: la
   cadena ya con la contraseña puesta.

Que el repositorio sea público no afecta: los *secrets* no se ven ni se publican,
y solo los usa GitHub al ejecutar el proceso.

Para lanzarlo a mano en cualquier momento: pestaña **Actions → Aplicar SQL a
Supabase → Run workflow**.

### 2. Comprobar que todo funciona (opcional, 1 minuto)

En el **SQL Editor** de Supabase, ejecuta `sql/99_autoprueba.sql`. Prueba de
punta a punta el PIN, el cierre del plazo, el secreto de las alineaciones, la
convocatoria, la puntuación y el panel de admin, y **deshace todo lo que crea**.
Termina siempre en rojo: si el mensaje dice `AUTOPRUEBA: TODO CORRECTO`, está
todo bien.

### 3. Publicar la web

**Opción rápida (sin cuenta, ideal para salir del paso):** entra en
<https://app.netlify.com/drop> y arrastra la carpeta `porra-sevilla` entera. En
segundos te da una dirección pública que ya puedes pegar en el grupo.

**Opción definitiva — GitHub Pages:**

1. Crea una cuenta en <https://github.com> si no la tienes.
2. Crea un repositorio **público** llamado `familia-rojiblanca`.
3. Sube el contenido de esta carpeta (*Add file → Upload files*, arrastrando la
   carpeta entera; o por git si lo prefieres).
4. **Settings → Pages → Source: Deploy from a branch → Branch: `main` / `root`** →
   Save.
5. En un par de minutos tendrás la web en
   `https://TU-USUARIO.github.io/familia-rojiblanca/`. Ese es el enlace que se
   pega en el grupo.

Que el repositorio sea público no es problema: lo único sensible que contiene es
la clave `anon`, que es pública por diseño. Los PIN se guardan cifrados en la
base de datos y nunca salen de ella.

### 4. Primer arranque

- Entra en la pestaña **Admin** y escribe la contraseña de administrador que
  quieras: **la primera que introduzcas queda fijada** como contraseña de admin.
- Cada participante, la primera vez que entra, elige su nombre y escribe un PIN
  de 4 dígitos: **ese PIN queda registrado** como suyo. Si alguien lo olvida, tú
  puedes reiniciarlo desde Admin.

## Cómo funciona

- **Mi alineación**: eliges 11 jugadores de la plantilla. Puedes cambiarlos las
  veces que quieras hasta el cierre; vale la última versión guardada.
- **Solo se juega al próximo partido.** Aunque el calendario tenga las 38
  jornadas cargadas, solo se puede alinear a la primera que siga con el plazo
  abierto, para que nadie mande su once a la jornada equivocada. Las demás se
  van abriendo una a una según se disputan. La pestaña **Jornada** enseña las ya
  cerradas y el próximo partido, nada más. Esto lo comprueba la base de datos,
  no la página.
- **Convocatoria** (opcional): cuando el Sevilla publica la lista de convocados,
  el admin la carga y a partir de ese momento **solo se puede alinear a los
  convocados**; los demás salen tachados y no se dejan elegir. Mientras no haya
  convocatoria, vale toda la plantilla. Lo enviado antes de conocerse la
  convocatoria **sigue contando**. Ver más abajo.
- **Cierre**: automático **1 hora antes del inicio** del partido, o **antes si se
  conoce el once** — el club a veces lo confirma minutos antes de esa hora, y en
  cuanto se sabe (aunque sea solo la propuesta del robot, sin confirmar todavía)
  se corta el envío: no tendría sentido dejar cambiar el once ya sabiendo quién
  sale de inicio. El admin puede prorrogar el cierre por hora unos minutos si
  hace falta, pero eso no reabre el envío si el once ya está confirmado. Hasta el
  cierre nadie ve las alineaciones de los demás (solo quién ha enviado ya); esa
  revelación sigue yendo por la hora prevista, no por si el once se conoce antes.
- **Clasificación del día**: al cerrarse se revelan todos los onces. Cuando el
  admin marca el once inicial real, aparecen aciertos y puntos. Debajo de cada
  alineación se ve **a qué hora la envió cada uno** y, si la retocó, cuándo fue
  el último cambio — para las discusiones de después. Esas horas salen al mismo
  tiempo que las alineaciones: antes del cierre nadie las ve.
- **Clasificación general**: acumulado de las 38 jornadas. Los empates se
  muestran como tales (dos primeros, ningún segundo).
- Quien no envía alineación figura como **no participó**, con 0 puntos.

## La convocatoria se carga sola

El Sevilla FC publica la convocatoria en su propia web, y dentro va **en texto**:
«La lista completa la forman: Odysseas, Fran González…». Un proceso de GitHub
(`.github/workflows/convocatoria.yml`) mira **cada media hora, desde el día antes
del partido**, si sigue sin convocatoria y con el plazo abierto; cuando el club la
publica, la encuentra, cruza los nombres con la plantilla y la carga. No tienes
que hacer nada.

Un par de reglas para que no te sorprenda:

- **Nunca pisa lo que hayas hecho tú.** Si ya la habías cargado a mano, el robot
  no la toca. Y en cuanto tú guardas la convocatoria desde Admin, pasa a constar
  como puesta a mano.
- **No carga nada con el plazo cerrado**, que a esas alturas ya no serviría.
- **Si algo no cuadra, se calla.** Si de los 24 nombres de la noticia casan menos
  de 14 con la plantilla, no guarda nada y lo anota en su registro: es señal de
  que la plantilla está sin actualizar o de que la web del club ha cambiado.
- En Admin verás si la cargó él, con un enlace a la noticia, y puedes corregir
  lo que quieras: manda siempre lo último que guardes tú.

Los nombres no coinciden exactamente con los de la plantilla («Juan Iglesias» por
«Iglesias», «Andrés Castrín» por «A. Castrín»), y eso ya lo resuelve solo. Los
canteranos que no estén dados de alta se quedan fuera y se anotan en el registro
del proceso; si quieres que puedan alinearse, añádelos desde Admin.

## El once inicial: te lo deja propuesto, tú lo confirmas

El mismo proceso busca también el once. Cuando se confirma la alineación, el club
lo escribe en la noticia **en directo** del partido:

> **20:10 | ¡CONFIRMADO EL ONCE DEL SEVILLA FC!**
> Luis García Plaza sale con Odysseas; Iglesias, Sangante, Kike Salas, Suazo;
> Agoumé, Nico Guillén, Guridi; Miguel Sierra, Oso e Isaac.

Lo busca **cada cinco minutos, desde hora y media antes del partido**, y deja de
mirar en cuanto lo encuentra. Si a **45 minutos del inicio** sigue sin aparecer,
la pestaña **Admin** te lo avisa en rojo para que lo vayas marcando a mano; ahí
verás también a qué hora miró el robot por última vez y con qué se encontró.

De ahí saca los once nombres. Pero **no los publica**: los deja como propuesta.
En **Admin → Once inicial** te aparece un recuadro con la alineación leída y un
botón *Usar esta propuesta*, que la coloca sobre el campo; la repasas y le das a
*Guardar once oficial*. **Hasta que no la guardas tú no se puntúa nada.**

Es a propósito: el once es lo que reparte los puntos, así que de eso responde una
persona y no un robot. Confirmarlo son dos toques.

Si algo no cuadra —que lean diez nombres, o uno que no está en la plantilla— no
propone nada y lo anota en su registro. Tú lo marcas a mano como siempre.

Son **dos procesos separados** — *Cargar la convocatoria* y *Proponer el once
inicial*—, cada uno con su botón *Run workflow* en la pestaña **Actions**. Van
aparte a propósito: son cosas distintas y en momentos distintos, y así ninguna
arrastra a la otra si falla.

> ¿Y por qué no se leen los tuits de @SevillaFC? Porque desde febrero de 2026 X
> cobra por leer publicaciones y habría que darle una tarjeta. La web del club da
> lo mismo, gratis y en texto limpio.

## La convocatoria a mano, paso a paso

Sigue estando, y es lo que se usa si el club cambia su web o si prefieres
cargarla tú:

El Sevilla publica la convocatoria de cada partido como una imagen con el dorsal
y el apellido de cada jugador. La web la lee sola:

1. **Admin → Convocatoria.** Elige la jornada (viene puesta la del próximo
   partido) y sube la foto, tal cual te llegue por WhatsApp.
2. Pulsa **Analizar la foto**. La primera vez tarda algo más (medio minuto,
   según el móvil) porque se descarga el lector de texto; después va rápido.
   La foto **no se sube a ningún sitio**: se lee en tu propio móvil.
3. Te deja marcados los jugadores que ha reconocido, y aparte las líneas que no
   ha sabido casar con nadie. Suelen ser **canteranos que no están en la
   plantilla**: cada uno trae un botón *Añadir a la plantilla* que los da de
   alta y los deja convocados. Si lo que hay es una errata de lectura, a veces
   propone el jugador parecido («¿Es Oso?») para arreglarlo de un toque.
4. **Repasa la lista** contra la foto: un toque quita o pone a cualquiera. Para
   que nada se quede escondido, debajo tienes también **quién se queda sin
   convocar** — si ves ahí a alguien que sí estaba en la foto, márcalo y listo.
5. **Guardar convocatoria.**

A partir de ahí, en «Mi alineación» los no convocados salen tachados y no se
pueden elegir. Quien ya hubiera enviado un once con alguno de ellos ve un aviso
con los nombres, y ese jugador le sale tachado sobre el campo.

**Su alineación sigue contando tal cual está**, con la puntuación que saque: lo
único que pasa es que ese jugador no puede acertar, porque no va a salir en el
once inicial. Le interesa cambiarlo, pero no pierde la alineación ni figura como
que no participó. Eso sí: para guardar cualquier cambio tendrá que sustituirlo
primero, porque a partir de la convocatoria ya no se admite alinear a nadie de
fuera.

Si te equivocas, **Quitar convocatoria** deja las cosas como estaban y vuelve a
valer toda la plantilla. Y si al final jugó alguien que no figuraba en la lista,
el once oficial no te dejará marcarlo hasta que corrijas la convocatoria: es
deliberado, porque si no habría gente penalizada por un fallo de lectura.

> La comprobación de verdad está en la base de datos, no en la página: aunque
> alguien trastee la web, el servidor rechaza cualquier once con un jugador sin
> convocar.

## Estructura

```
index.html            la web entera (4 pestañas)
demo.html             la misma web con datos de ejemplo y sin base de datos,
                      para probar sin tocar nada real
app/config.js         URL y clave de Supabase
app/api.js            llamadas a la base de datos
app/demo.js           base de datos de mentira, solo para demo.html
app/convocatoria.js   lee la foto de la convocatoria y la cruza con la plantilla
app/app.js            lógica de la interfaz
robot/comun.py        lo que comparten los dos robots (pedir páginas, casar nombres)
robot/convocatoria.py busca la convocatoria en la web del club (lo usa GitHub)
robot/once.py         busca el once inicial y lo deja propuesto
robot/orden_sql.py    arma la orden de SQL que guarda lo que han encontrado
css/estilos.css
sql/01_esquema.sql    tablas
sql/02_api.sql        funciones (seguridad, cierre, puntuación)
sql/03_datos.sql      participantes, plantilla y jornada 1
sql/04_calendario.sql las 37 jornadas restantes, con la hora aún sin confirmar
sql/05_robot.sql      lo que usa el robot de la convocatoria
sql/99_autoprueba.sql prueba de que todo funciona; no deja rastro
data/seed.json        los mismos datos en JSON, para referencia
```

## Si se te olvida una contraseña

- **El PIN de un participante**: se reinicia desde el panel **Admin**, en la
  tabla de participantes. La próxima vez que entre, elegirá uno nuevo.
- **La contraseña de administrador**: no se puede consultar (se guarda con hash
  bcrypt). Se reinicia ejecutando esto en el SQL Editor de Supabase y entrando
  **acto seguido** en Admin para fijar la nueva:

  ```sql
  delete from config where clave = 'admin_pass_hash';
  delete from sesiones where es_admin;
  ```

  Mientras no haya contraseña puesta, el puesto de administrador lo puede
  reclamar cualquiera que entre en la web, así que no dejes el reinicio a medias.

## Seguridad, en corto

- Las tablas están cerradas: con la clave pública no se puede leer ni escribir
  nada directamente (comprobado).
- El PIN se guarda con *hash* bcrypt; ni viaja de vuelta ni se puede consultar.
- Ocho intentos fallidos por participante y cuarto de hora, y luego a esperar.
  Un PIN de 4 dígitos con ese límite aguanta de sobra para un grupo de amigos,
  pero no es una cuenta bancaria: no uses un PIN que uses para otra cosa.
- El plazo de cierre lo comprueba la base de datos con su propio reloj, así que
  no vale con cambiar la hora del móvil ni trastear la página. Lo mismo con la
  convocatoria: la lista de convocados se valida en el servidor.
- Las alineaciones ajenas **no salen** de la base de datos hasta el cierre.

## Datos de partida

- Participantes: Andrii, Chiquitín, Javi, Jesús, Tio P, Tito.
- Plantilla: lista oficial de dorsales 2026/27, **pendiente del cierre del
  mercado en septiembre**. Se ajusta desde Admin.
- Jornada 1: **Sevilla – Rayo Vallecano, sábado 15 de agosto 2026, 21:30**
  (cierre a las 20:30). Es la única con hora oficial.
- Jornadas 2 a 38: rival, campo y día del sorteo oficial de LaLiga 26/27; la
  hora, tentativa hasta que LaLiga la publique.
- Las posiciones de los jugadores solo se usan para dibujar el campo; la
  puntuación no depende de ellas.
