# Contexto para Claude

Léeme antes de tocar nada, junto con el `README.md` (que explica la puesta en
marcha y el uso diario).

## Qué es esto

Web para el concurso de alineaciones del grupo de WhatsApp «Familia Rojiblanca».
Antes de cada partido del Sevilla FC, cada participante envía su once. Cuando se
conoce el once inicial real se reparten puntos según los aciertos:

| Aciertos | 11 | 10 | 9 | 8 | 7 | 6 | ≤5 |
|---|---|---|---|---|---|---|---|
| Puntos | 100 | 50 | 25 | 10 | 5 | 1 | 0 |

Temporada LaLiga 2026/27, 38 jornadas.

## Dónde vive

| Qué | Dónde |
|---|---|
| Código | esta carpeta (raíz del proyecto y del repositorio) |
| Web publicada | <https://jmn88.github.io/familia-rojiblanca/> |
| Repositorio | <https://github.com/jmn88/familia-rojiblanca> (público, rama `main`) |
| Base de datos | proyecto Supabase; URL y clave `anon` en `app/config.js` |

## Cómo hablar con el usuario

Responde **en español**. No es programador: explica en términos claros, sin jerga
innecesaria, y di siempre qué tiene que hacer él y qué haces tú.

## Decisiones ya tomadas (no volver a preguntarlas)

- **Sin framework y sin paso de compilación.** En este equipo hay Python 3.12 y
  git, pero **no hay Node ni npm**. El sitio son ficheros estáticos que se
  publican tal cual en GitHub Pages.
- **Supabase como base de datos**, con la web hablándole por funciones RPC de
  PostgREST (`POST /rest/v1/rpc/<funcion>`).
- **Identidad**: desplegable con el nombre + PIN de 4 dígitos. El primer inicio
  de sesión fija el PIN de esa persona. El administrador tiene contraseña propia
  y la primera que se escribe queda fijada. **Único administrador: Jesús.**
- **Cierre del plazo**: automático una hora antes del inicio del partido, con
  botones de prórroga (+10 / +30 min) para el administrador.
- **Solo se alinea al próximo partido**: la jornada de número más bajo con el
  plazo todavía abierto (`f_jornada_proxima()` en SQL, `es_proxima` en el JSON
  del estado). Las jornadas futuras no se ofrecen en ninguna pestaña y
  `api_guardar` las rechaza. Es para que nadie mande su once a la jornada
  equivocada teniendo las 38 cargadas.
- **Horas tentativas**: LaLiga fija el horario pocas semanas antes. Las jornadas
  llevan `hora_confirmada`; mientras esté a `false` la web enseña el distintivo
  «hora sin confirmar» y lo explica. El administrador la marca al corregir el
  horario, desde Admin.
- **Convocatoria** (`jornadas.convocatoria`, un `int[]`): opcional. A `null` vale
  toda la plantilla; con lista, `api_guardar` y `api_admin_once` rechazan a
  cualquiera que no esté en ella. Se carga desde Admin subiendo la foto que
  publica el club, que se lee **en el propio navegador** con tesseract.js
  (`app/convocatoria.js`, descargado de jsDelivr solo al usar esa pantalla). La
  foto no se sube a ningún sitio ni se guarda: lo único que viaja es la lista de
  identificadores, y solo al pulsar Guardar. **La lectura siempre la confirma el
  administrador antes de guardar**: nunca se aplica a ciegas.
- **La convocatoria se carga sola desde la web del club**, que la publica en
  texto («La lista completa la forman: …») dentro del HTML servido, sin hacer
  falta navegador. Lo hace `.github/workflows/convocatoria.yml` cada media hora,
  con `robot/convocatoria.py` (solo biblioteca estándar) y las funciones
  `robot_*` de `sql/05_robot.sql`, a las que **se les retira el permiso al rol
  anónimo**: se llaman con la cadena de conexión, nunca desde la web. Reglas del
  robot: no pisa nunca una convocatoria ya puesta, no carga con el plazo
  cerrado, y si casan menos de 14 nombres no guarda nada. La subida por foto se
  queda como respaldo.
  **Leer los tuits de @SevillaFC se descartó**: desde febrero de 2026 X cobra por
  publicación leída. No lo replantees sin que el usuario lo pida.
- **El once inicial el robot lo PROPONE, no lo publica.** Sale de la noticia «en
  directo» del partido, donde el club escribe «¡CONFIRMADO EL ONCE DEL SEVILLA
  FC! … sale con Odysseas; Iglesias, …». Se guarda en `once_propuesto` y el
  administrador lo confirma desde Admin con «Usar esta propuesta» + Guardar.
  Ventanas de vigilancia (las decide SQL, no el cron): la convocatoria desde el
  día antes del partido y cada media hora; el once cada cinco minutos desde 90
  min antes hasta que aparece. Si a 45 min del inicio no hay once ni propuesta,
  Admin lo avisa en rojo (se calcula en el navegador con `kickoff`, sin estado
  nuevo) y enseña el último intento del robot (`once_robot_intento/motivo`).
  Decisión del usuario, y con motivo: el once reparte los puntos, así que de eso
  responde una persona. **No lo conviertas en automático.**
  Ojo al buscar en el HTML del club: el once va en MAYÚSCULAS y hay cadenas de
  la tienda («LINEUP: Alineaciones») que despistan si buscas «once» en
  minúsculas — ese error ya se cometió una vez.
- **La foto se interpreta por coordenadas, no por el texto leído.** El cartel va
  a dos columnas y el lector las devuelve pegadas en un renglón («1 ODYSSEAS 17
  SUAZO»); además la fuente del club (Montecatini Pro) deforma las cifras — el
  17 sale como `'`, el 39 como `3`. Partiendo por los números se perdían
  jugadores enteros, sin salir siquiera como dudosos. Ahora se parte por el
  hueco horizontal entre palabras (`fichasDe`), y el dorsal es solo un apoyo:
  manda el apellido. **No lo devuelvas a analizar `data.text`.** Para probarlo
  sin foto está `CONVOCATORIA.analizarLectura(data, ancho, plantilla)`, al que
  se le pasa una lectura guardada.
- **La convocatoria no invalida lo ya enviado.** Una alineación guardada antes de
  conocerse la convocatoria sigue contando y puntuando como cualquier otra; el
  jugador sin convocar simplemente no puede acertar, porque no saldrá en el once
  oficial. Ni se borra, ni cuenta como «no participó». Lo que sí se impide es
  guardar cambios nuevos con alguien de fuera de la lista. Está cubierto por la
  autoprueba: no lo conviertas en un descarte.
- **Las alineaciones ajenas no se ven hasta el cierre**; antes solo se sabe quién
  ha enviado ya.
- **Alineación**: 11 jugadores libres de la plantilla, sin validar posiciones. Se
  dibujan sobre un campo de forma orientativa, pero **la posición no afecta a la
  puntuación**.
- **Empates** en la clasificación general: se muestran empatados, sin criterio de
  desempate (1, 1, 3…).
- **Quien no envía**: 0 puntos y la marca «no participó», distinta de quien envió
  y falló.
- **Solo LaLiga** (ni Copa ni competición europea). Sin histórico de temporadas
  anteriores.
- **Participantes**: Andrii, Chiquitín, Javi, Jesús, Tio P, Tito.

## Arquitectura, y por qué importa

La clave `anon` de Supabase es pública y va dentro de la web, así que **la
seguridad no puede depender del navegador**:

- Todas las tablas tienen RLS activado y **ninguna política** para el rol
  anónimo: con la clave pública no se puede leer ni escribir directamente
  (comprobado desde fuera).
- Todo pasa por funciones `SECURITY DEFINER` en `sql/02_api.sql`, que son las
  únicas que tocan las tablas. Ahí dentro se validan el PIN (bcrypt, con límite
  de 8 intentos fallidos por cuarto de hora), la hora de cierre contra el reloj
  del servidor y la visibilidad de las alineaciones.
- **Regla de oro: cualquier comprobación que importe va en SQL, no en
  JavaScript.** El frontend solo pinta.
- Las puntuaciones **no se almacenan**: se calculan al vuelo comparando los
  `picks` con el `once_oficial`. Corregir el once oficial recalcula todo solo.

Ficheros:

```
index.html            la web (4 pestañas: Mi alineación, Jornada, General, Admin)
demo.html             la misma web con datos de ejemplo y sin base de datos
app/config.js         URL y clave de Supabase
app/api.js            llamadas RPC a la base de datos
app/demo.js           base de datos falsa, solo para demo.html
app/convocatoria.js   lee la foto de la convocatoria (imagen -> lista de jugadores)
app/app.js            toda la lógica de la interfaz
robot/comun.py        pedir páginas del club y casar nombres con la plantilla
robot/convocatoria.py busca la convocatoria en la web del club; lo lanza GitHub
robot/once.py         busca el once inicial y lo deja PROPUESTO, sin publicar
robot/orden_sql.py    arma la orden de SQL, ya escapada, que guarda el resultado
css/estilos.css
sql/01_esquema.sql    tablas y cierre de permisos
sql/02_api.sql        funciones (PIN, cierre, puntuación, admin)
sql/03_datos.sql      participantes, plantilla y jornada 1
sql/04_calendario.sql jornadas 2 a 38 del sorteo oficial, con hora tentativa
sql/05_robot.sql      funciones del robot; cerradas al rol anónimo a propósito
sql/99_autoprueba.sql prueba de extremo a extremo; no deja rastro
data/seed.json        los mismos datos de partida en JSON, como referencia
```

Si tocas `app/demo.js`, recuerda que sus alineaciones usan **identificadores de
jugador** (el orden de la lista), no dorsales.

## Cómo llega el SQL a Supabase

**No se pega a mano en el SQL Editor.** `.github/workflows/aplicar-sql.yml`
aplica `sql/0*.sql` (01, 02, 03, 04… — la autoprueba 99 queda fuera a propósito)
cada vez que se sube a `main` un cambio dentro de `sql/`, y también a demanda
desde Actions. Usa el secret `SUPABASE_DB_URL`, que es la cadena de conexión
**Session pooler** de Supabase (la conexión directa es solo IPv6 y no llega desde
GitHub).

**`psql -c` no sustituye las variables de psql.** Una orden como
`psql -c "select f(:'x')"` se manda tal cual al servidor y revienta con
`syntax error at or near ":"`. Por eso las órdenes del robot se arman en
`robot/orden_sql.py`, ya escapadas, y se le dan a psql con `-f`. No lo vuelvas
a hacer con `-c` y variables.

Consecuencia práctica: **cambiar un fichero de `sql/` y subirlo ya es aplicarlo.**
Por eso los scripts tienen que seguir siendo repetibles — nada de `insert` sin
`on conflict`, nada de `drop table`, nada que pise lo que el admin haya corregido
desde la web. Si algún cambio no puede cumplir eso, hay que avisar al usuario en
vez de colarlo.

Los ficheros van cada uno en su transacción (`--single-transaction`), así que un
error a media ejecución deshace ese fichero entero.

## Estado actual

Funcionando y verificado:

- Base de datos al día: el secret `SUPABASE_DB_URL` está puesto y el proceso de
  GitHub aplica `sql/0*.sql` en cada push. Comprobado en vivo contra la web
  publicada: 38 jornadas, 23 jugadores (Sangante ya de defensa), y las funciones
  devuelven el campo `convocatoria`.
- `sql/99_autoprueba.sql` ejecutado con resultado `AUTOPRUEBA: TODO CORRECTO`.
  Ojo: **termina siempre en rojo a propósito** — lanza una excepción para que
  PostgreSQL revierta todo lo que ha creado. El mensaje es el resultado.
- Web publicada y comprobada en vivo: carga todos los ficheros y conecta con la
  base de datos.
- Servidor de pruebas local: `.claude/launch.json` levanta
  `py -m http.server 8777` sobre esta carpeta.

## Pendiente

1. **Pasar `sql/99_autoprueba.sql`** por el SQL Editor de Supabase: el proceso
   automático no la ejecuta (a propósito), así que hay que lanzarla a mano
   después de tocar el SQL. Recuerda que acaba en rojo aunque vaya todo bien.
2. **Las horas de cada jornada** hay que irlas confirmando semana a semana desde
   Admin, según las publique LaLiga.
3. **La plantilla** es la lista oficial de dorsales, pendiente del cierre del
   mercado de fichajes de septiembre de 2026. Se ajusta desde Admin.
4. **La convocatoria está entera pero sin estrenar en vivo**: comprobada contra
   la demo (incluida la lectura de una imagen con el formato del club), no
   todavía con una foto real del Sevilla ni contra Supabase. El primer partido
   que se cargue conviene mirarlo con calma.

## Cosas que no están aquí ni debes pedir

La contraseña de administrador y los PIN de los participantes no los sabe nadie
más que ellos: se guardan con hash y no se pueden consultar. Si hace falta
reiniciarlos, el `README.md` explica cómo.
