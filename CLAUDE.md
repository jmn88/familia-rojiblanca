# Contexto para Claude

Léeme entero antes de tocar nada. Este fichero es la memoria del proyecto: está
escrito para que cualquier conversación nueva pueda ponerse al día sin que el
usuario tenga que explicar otra vez de qué va todo esto.

El `README.md` es el manual del usuario (puesta en marcha y uso diario). Aquí
está el porqué de las cosas, las decisiones ya tomadas y las trampas conocidas.

> **Y una regla que vale para toda conversación: cuando hagas algo, actualiza
> este fichero.** Las instrucciones concretas están al final, en «Cómo mantener
> este fichero». No es opcional ni es un extra: es parte del trabajo.

## Qué es esto

Web para el concurso de alineaciones del grupo de WhatsApp «Familia Rojiblanca».
Antes de cada partido del Sevilla FC, cada participante envía su once. Cuando se
conoce el once inicial real se reparten puntos según los aciertos:

| Aciertos | 11 | 10 | 9 | 8 | 7 | 6 | ≤5 |
|---|---|---|---|---|---|---|---|
| Puntos | 100 | 50 | 25 | 10 | 5 | 1 | 0 |

Temporada LaLiga 2026/27, 38 jornadas. Seis participantes: Andrii, Chiquitín,
Javi, Jesús, Tio P y Tito.

## Dónde vive

| Qué | Dónde |
|---|---|
| Código | esta carpeta (raíz del proyecto y del repositorio) |
| Web publicada | <https://jmn88.github.io/familia-rojiblanca/> |
| Repositorio | <https://github.com/jmn88/familia-rojiblanca> (público, rama `main`) |
| Base de datos | proyecto Supabase; URL y clave `anon` en `app/config.js` |
| Pruebas en local | `.claude/launch.json` levanta `py -m http.server 8777` |

## Cómo hablar con el usuario

Responde **en español**. No es programador: explica en términos claros, sin jerga
innecesaria, y di siempre qué tiene que hacer él y qué haces tú.

Trabaja como se ha trabajado hasta ahora, que ha funcionado bien:

- **Comprueba antes de afirmar.** Casi todos los fallos de esta lista se
  encontraron probando en vivo, no leyendo el código. Si dices que algo funciona,
  que sea porque lo has visto funcionar.
- **Cuenta los fallos propios sin adornos.** Ha habido varios (mira «Trampas
  conocidas»); decirlos claramente y arreglarlos es lo que se espera.
- **No subas a producción sin que lo pida.** Subir a `main` despliega la web *y*
  aplica el SQL a la base de datos de verdad. Cuando el usuario diga «no lo pases
  a prod», deja el commit hecho en local y avísale del comando para subirlo.

## Qué sabe hacer la web hoy

Cuatro pestañas. Todo lo que importa lo comprueba la base de datos, no el
navegador.

### Mi alineación
- Entrar con el nombre (desplegable) y un PIN de 4 dígitos. El primero que
  escribes queda fijado como el tuyo.
- Elegir 11 jugadores de la plantilla, con el once dibujado sobre un campo.
- Se puede cambiar las veces que haga falta hasta el cierre; vale la última
  versión guardada.
- Si hay convocatoria cargada, los no convocados salen tachados y no se pueden
  elegir. A quien ya hubiera enviado un once con alguno, se le avisa (su
  alineación sigue contando, ver «Decisiones»).
- Cuenta atrás hasta el cierre, y aviso si LaLiga aún no ha confirmado la hora.

### Jornada
- Antes del cierre: solo se ve **quién ha enviado ya**, nunca qué.
- Al cerrarse se revelan todos los onces, con **a qué hora envió cada uno** su
  alineación y, si la retocó, cuándo fue el último cambio.
- Con el once oficial puesto: aciertos, puntos y clasificación del día.
- Solo se listan las jornadas ya cerradas y el próximo partido.

### General
- Clasificación acumulada y tabla jornada a jornada.
- Empates mostrados como tales (1, 1, 3…), sin criterio de desempate.

### Admin (solo Jesús, con contraseña propia)
- **Jornadas**: crear y editar, marcar la hora como oficial, prorrogar el cierre
  (+10 / +30 min).
- **Convocatoria**: se carga sola (ver «Los robots»), y si hace falta se sube la
  foto del club y se lee en el propio navegador. Se repasa y se guarda.
- **Once inicial**: el robot lo deja propuesto y el administrador lo confirma con
  «Usar esta propuesta» + Guardar. También se puede marcar a mano.
- **Participantes**: alta y reinicio de PIN.
- **Plantilla**: altas, bajas, dorsales y posiciones.

## Decisiones ya tomadas (no volver a preguntarlas)

### Cómo está montado
- **Sin framework y sin paso de compilación.** En este equipo hay Python 3.12 y
  git, pero **no hay Node ni npm**. El sitio son ficheros estáticos que se
  publican tal cual en GitHub Pages.
- **Supabase como base de datos**, con la web hablándole por funciones RPC de
  PostgREST (`POST /rest/v1/rpc/<funcion>`).
- **Identidad**: desplegable con el nombre + PIN de 4 dígitos. El primer inicio
  de sesión fija el PIN de esa persona. El administrador tiene contraseña propia
  y la primera que se escribe queda fijada. **Único administrador: Jesús.**

### Reglas del concurso
- **Alineación**: 11 jugadores libres de la plantilla, sin validar posiciones. Se
  dibujan sobre un campo de forma orientativa, pero **la posición no afecta a la
  puntuación**.
- **Empates**: se muestran empatados, sin criterio de desempate.
- **Quien no envía**: 0 puntos y la marca «no participó», distinta de quien envió
  y falló.
- **Solo LaLiga** (ni Copa ni competición europea). Sin histórico de temporadas
  anteriores.
- **Las alineaciones ajenas no se ven hasta el cierre**; antes solo se sabe quién
  ha enviado ya. Las horas de envío se revelan a la vez que las alineaciones.

### El cierre del plazo
- Automático **una hora antes** del inicio, con prórrogas para el administrador.
- **También se cierra en cuanto se conoce el once** (`once_oficial` o
  `once_propuesto`, aunque sea la propuesta del robot sin confirmar),
  independientemente del reloj — comprobado en `api_guardar`, en SQL. Motivo: el
  club a veces publica la alineación minutos antes de la hora normal de cierre, y
  hubo una jornada real con veinte minutos de ventana en la que se podía cambiar
  el once sabiendo ya quién jugaba. **La revelación** de las alineaciones ajenas
  sigue yendo solo por el reloj: eso no se adelanta.
- **Solo se alinea al próximo partido**: la jornada de número más bajo con el
  plazo abierto (`f_jornada_proxima()` en SQL, `es_proxima` en el JSON). Las
  futuras no se ofrecen y `api_guardar` las rechaza, para que nadie mande su once
  a la jornada equivocada teniendo las 38 cargadas.
- **Horas tentativas**: LaLiga fija el horario pocas semanas antes. Las jornadas
  llevan `hora_confirmada`; a `false`, la web enseña «hora sin confirmar» y lo
  explica. El administrador la marca al corregir el horario.

### La convocatoria
- `jornadas.convocatoria` (`int[]`) es opcional. A `null` vale toda la plantilla;
  con lista, `api_guardar` y `api_admin_once` rechazan a cualquiera de fuera.
- **No invalida lo ya enviado.** Una alineación guardada antes de conocerse la
  convocatoria sigue contando y puntuando; el jugador sin convocar simplemente no
  puede acertar, porque no saldrá en el once oficial. Ni se borra, ni cuenta como
  «no participó». Lo que sí se impide es guardar cambios nuevos con alguien de
  fuera. Está cubierto por la autoprueba: **no lo conviertas en un descarte**.
- **Por foto** (respaldo): `app/convocatoria.js` lee la imagen del club con
  tesseract.js, descargado de jsDelivr solo al usar esa pantalla. La foto no se
  sube a ningún sitio ni se guarda: solo viaja la lista de identificadores, y solo
  al pulsar Guardar. **La lectura siempre la confirma el administrador**.

### El once inicial
- **El robot lo PROPONE, no lo publica.** Se guarda en `once_propuesto` y el
  administrador lo confirma desde Admin. Decisión del usuario y con motivo: el
  once reparte los puntos, así que de eso responde una persona.
  **No lo conviertas en automático.**
- Si a 45 min del inicio no hay once ni propuesta, Admin lo avisa en rojo (se
  calcula en el navegador con `kickoff`, sin estado nuevo) y enseña el último
  intento del robot (`once_robot_intento` / `once_robot_motivo`).

## Los robots

Dos procesos de GitHub, cada uno en su fichero, que van solos. **Quién decide si
toca actuar es SQL, no el cron**: fuera de su ventana, el proceso se va de vacío
en segundos.

| Proceso | Cada | Ventana (la marca SQL) | Qué hace |
|---|---|---|---|
| `convocatoria.yml` | 30 min | desde 1 día antes, con el plazo abierto | Carga la convocatoria |
| `once.yml` | 5 min | desde 90 min antes hasta que aparece (tope: +3 h) | Deja el once **propuesto** |

- Los datos salen de **la web del club**, que publica ambas cosas en texto dentro
  del HTML servido: la convocatoria en «La lista completa la forman: …» y el once
  en la noticia «en directo» («¡CONFIRMADO EL ONCE DEL SEVILLA FC! … sale con
  Odysseas; Iglesias, …»). No hace falta navegador ni OCR.
- **Leer los tuits de @SevillaFC se descartó**: desde febrero de 2026 X cobra por
  publicación leída. No lo replantees sin que el usuario lo pida.
- Reglas: nunca pisan lo que haya puesto una persona; no cargan con el plazo
  cerrado; y si no cuadran los nombres (menos de 14 en la convocatoria, distintos
  de 11 en el once) no guardan nada y lo dejan anotado.
- Los nombres del club no coinciden literalmente con la plantilla («Juan
  Iglesias» → Iglesias, «Andrés Castrín» → A. Castrín, «Miguel Sierra» →
  M. Sierra). De casarlos se encarga `robot/comun.py`.
- El cron de GitHub **no es puntual**: se retrasa cuando hay cola. Por eso existe
  el aviso de los 45 minutos, que no depende de ellos.

## Arquitectura, y por qué importa

La clave `anon` de Supabase es pública y va dentro de la web, así que **la
seguridad no puede depender del navegador**:

- Todas las tablas tienen RLS activado y **ninguna política** para el rol
  anónimo: con la clave pública no se puede leer ni escribir directamente.
- Todo pasa por funciones `SECURITY DEFINER` en `sql/02_api.sql`, las únicas que
  tocan las tablas. Ahí se validan el PIN (bcrypt, con límite de 8 intentos
  fallidos por cuarto de hora), la hora de cierre contra el reloj del servidor y
  la visibilidad de las alineaciones.
- **Regla de oro: cualquier comprobación que importe va en SQL, no en
  JavaScript.** El frontend solo pinta.
- Las puntuaciones **no se almacenan**: se calculan al vuelo comparando los
  `picks` con el `once_oficial`. Corregir el once oficial recalcula todo solo.
- Las funciones `robot_*` están **cerradas al rol anónimo**: se llaman con la
  cadena de conexión desde GitHub, nunca desde la web.

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

Si tocas `app/demo.js`: sus alineaciones usan **identificadores de jugador** (el
orden de la lista), no dorsales; y al cambiar la forma de los datos hay que subir
el número de `CLAVE` (`fr_demo_vN`), porque si no el navegador sigue con la copia
vieja guardada.

## Cómo llega el SQL a Supabase

**No se pega a mano en el SQL Editor.** `.github/workflows/aplicar-sql.yml`
aplica `sql/0*.sql` (01, 02, 03… — la autoprueba 99 queda fuera a propósito) cada
vez que se sube a `main` un cambio dentro de `sql/`, y también a demanda desde
Actions. Usa el secret `SUPABASE_DB_URL`, la cadena de conexión **Session pooler**
de Supabase (la directa es solo IPv6 y no llega desde GitHub).

Consecuencia práctica: **cambiar un fichero de `sql/` y subirlo ya es aplicarlo.**
Por eso los scripts tienen que seguir siendo repetibles — nada de `insert` sin
`on conflict`, nada de `drop table`, nada que pise lo que el admin haya corregido
desde la web. Si algún cambio no puede cumplir eso, avisa al usuario en vez de
colarlo.

Cada fichero va en su transacción (`--single-transaction`): un error a media
ejecución deshace ese fichero entero.

## Trampas conocidas (errores ya cometidos, no repetirlos)

- **`psql -c` no sustituye las variables de psql.** `psql -c "select f(:'x')"` se
  manda tal cual al servidor y revienta con `syntax error at or near ":"`. Por eso
  las órdenes del robot se arman en `robot/orden_sql.py`, ya escapadas, y se pasan
  con `-f`.
- **`revoke ... from anon` no basta.** PostgreSQL concede `execute` a `PUBLIC` en
  cada función nueva y `anon` lo hereda: hay que retirárselo también a `PUBLIC`.
  Estuvo abierto en producción hasta que se comprobó desde la web publicada.
  `sql/05_robot.sql` lo verifica solo al aplicarse.
- **El club escribe el once en MAYÚSCULAS.** Buscar «once» en minúsculas solo
  encuentra cadenas de la tienda («LINEUP: Alineaciones»), y por eso se dio por
  hecho —mal— que el club no publicaba la alineación.
- **La foto se interpreta por coordenadas, no por el texto leído.** El cartel va a
  dos columnas y el lector las devuelve pegadas en un renglón («1 ODYSSEAS 17
  SUAZO»); además la fuente del club (Montecatini Pro) deforma las cifras (el 17
  sale como `'`, el 39 como `3`). Partiendo por los números se perdían jugadores
  enteros sin salir siquiera como dudosos. Se parte por el hueco horizontal entre
  palabras (`fichasDe`) y el dorsal es solo un apoyo: manda el apellido.
  **No lo devuelvas a analizar `data.text`.** Para probarlo sin foto está
  `CONVOCATORIA.analizarLectura(data, ancho, plantilla)`.
- **Al casar nombres, cuidado con los apellidos compartidos**: «Rafa Romero»
  (canterano) no puede hacerse pasar por «Isaac Romero». El listón está alto a
  propósito, tanto en JS como en Python.
- **Los mensajes de éxito se pierden si repintas después.** En Admin, escribe el
  aviso *después* de `pintarAdmin()`, no antes.
- **En YAML, un heredoc dentro de `run: |` rompe la indentación.** Si necesitas
  varias líneas de Python, ponlo en un fichero de `robot/`.
- **Puede haber más de una sesión de Claude trabajando en esta carpeta.** Ya pasó:
  una sesión hizo commit del trabajo a medias de la otra. Si ves cambios que no
  son tuyos, para y pregunta.

## Estado actual

Todo lo descrito arriba está **funcionando y verificado en vivo**:

- Base de datos al día: el secret `SUPABASE_DB_URL` está puesto y cada push de
  `sql/` se aplica solo (último en verde: `dd65ac0`).
- Web publicada y comprobada: carga y conecta con la base de datos.
- La lectura por foto se usó con un cartel real del Sevilla: falló al principio
  (de ahí las trampas de más arriba) y quedó corregida y probada contra esa misma
  lectura. Los dos robots se probaron con el texto real del club.
- Jornada 1 (Sevilla 15/08/2026) jugada, con once oficial puesto y puntos
  calculados.

## Pendiente

1. **Pasar `sql/99_autoprueba.sql`** por el SQL Editor de Supabase después de
   tocar el SQL: el proceso automático no la ejecuta a propósito. **Termina
   siempre en rojo** — lanza una excepción para revertir lo que crea; lo que vale
   es el mensaje (`AUTOPRUEBA: TODO CORRECTO`).
2. **Las horas de cada jornada** hay que confirmarlas semana a semana desde Admin,
   según las publique LaLiga.
3. **La plantilla** está pendiente del cierre del mercado de septiembre de 2026.
   Se ajusta desde Admin.
4. **El robot del once no se ha estrenado en un partido de verdad**: se probó con
   el texto real ya publicado, pero aún no ha cazado una alineación él solo.
   Conviene mirar la primera con calma.
5. **Sin historial de alineaciones**: al cambiar un once se sobrescribe el
   anterior y se pierde. Se habló de guardar versiones y quedó en el aire, porque
   el cierre anticipado ya evita el caso que preocupaba.

## Cómo mantener este fichero

**Cada vez que hagas algo en este proyecto, deja este fichero al día antes de dar
la tarea por terminada.** El usuario abre conversaciones nuevas a menudo y esto es
lo único que se lleva de una a otra. Un cambio sin documentar aquí es un cambio
que la próxima conversación no sabrá que existe.

Qué actualizar, según lo que hayas hecho:

- **Funcionalidad nueva** → descríbela en «Qué sabe hacer la web hoy», y si trae
  una regla nueva, en «Decisiones ya tomadas».
- **Decisión del usuario** (ha elegido A en vez de B) → apúntala en «Decisiones ya
  tomadas» **con el motivo**. El motivo importa más que la decisión: evita que la
  próxima conversación la deshaga por parecerle mejor idea.
- **Fichero nuevo** → añádelo a la lista de ficheros.
- **Fallo que te ha costado encontrar** → «Trampas conocidas», en una línea, con
  qué pasaba y cómo se evita. Esta sección es la más valiosa del documento.
- **Algo que queda a medias o pendiente del usuario** → «Pendiente».
- **Algo verificado en producción** → «Estado actual», diciendo qué se comprobó.

Cómo escribirlo:

- En español, en el mismo tono: frases claras, sin jerga, explicando el porqué.
- **Breve.** Esto se lee entero en cada conversación. Si una sección crece
  demasiado, resume y quita lo que ya no aplica; borrar lo que ha quedado obsoleto
  es tan importante como añadir.
- No dupliques el `README.md`: allí va cómo se usa, aquí por qué es así.
- No copies aquí lo que ya cuenta el código o el historial de git. Esto es para lo
  que **no** se deduce mirando los ficheros.

Si el usuario pide algo que contradice una decisión de este fichero, díselo,
recuérdale el motivo y **haz lo que él diga**: es su proyecto. Después, actualiza
la decisión aquí.

## Cosas que no están aquí ni debes pedir

La contraseña de administrador y los PIN de los participantes no los sabe nadie
más que ellos: se guardan con hash y no se pueden consultar. Si hace falta
reiniciarlos, el `README.md` explica cómo.
