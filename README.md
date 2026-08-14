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
   generar una nueva en el **engranaje de abajo a la izquierda (Project
   Settings) → Database**, apartado de la contraseña, botón *Reset database
   password*. Cópiala en ese momento, porque tampoco se vuelve a mostrar.

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
puntuación y el panel de admin, y **deshace todo lo que crea**. Termina siempre
en rojo: si el mensaje dice `AUTOPRUEBA: TODO CORRECTO`, está todo bien.

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
- **Cierre**: automático **1 hora antes del inicio** del partido. El admin puede
  prorrogarlo unos minutos si hace falta. Hasta el cierre nadie ve las
  alineaciones de los demás (solo quién ha enviado ya).
- **Clasificación del día**: al cerrarse se revelan todos los onces. Cuando el
  admin marca el once inicial real, aparecen aciertos y puntos.
- **Clasificación general**: acumulado de las 38 jornadas. Los empates se
  muestran como tales (dos primeros, ningún segundo).
- Quien no envía alineación figura como **no participó**, con 0 puntos.

## Estructura

```
index.html            la web entera (4 pestañas)
demo.html             la misma web con datos de ejemplo y sin base de datos,
                      para probar sin tocar nada real
app/config.js         URL y clave de Supabase
app/api.js            llamadas a la base de datos
app/demo.js           base de datos de mentira, solo para demo.html
app/app.js            lógica de la interfaz
css/estilos.css
sql/01_esquema.sql    tablas
sql/02_api.sql        funciones (seguridad, cierre, puntuación)
sql/03_datos.sql      participantes, plantilla y jornada 1
sql/04_calendario.sql las 37 jornadas restantes, con la hora aún sin confirmar
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
  no vale con cambiar la hora del móvil ni trastear la página.
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
