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
app/app.js            toda la lógica de la interfaz
css/estilos.css
sql/01_esquema.sql    tablas y cierre de permisos
sql/02_api.sql        funciones (PIN, cierre, puntuación, admin)
sql/03_datos.sql      participantes, plantilla y jornada 1
sql/04_calendario.sql jornadas 2 a 38 del sorteo oficial, con hora tentativa
sql/99_autoprueba.sql prueba de extremo a extremo; no deja rastro
data/seed.json        los mismos datos de partida en JSON, como referencia
```

Si tocas `app/demo.js`, recuerda que sus alineaciones usan **identificadores de
jugador** (el orden de la lista), no dorsales.

## Estado actual

Funcionando y verificado:

- Base de datos creada, los tres scripts SQL ejecutados y los datos cargados
  (6 participantes, 23 jugadores, jornada 1).
- `sql/99_autoprueba.sql` ejecutado con resultado `AUTOPRUEBA: TODO CORRECTO`.
  Ojo: **termina siempre en rojo a propósito** — lanza una excepción para que
  PostgreSQL revierta todo lo que ha creado. El mensaje es el resultado.
- Web publicada y comprobada en vivo: carga todos los ficheros y conecta con la
  base de datos.
- Servidor de pruebas local: `.claude/launch.json` levanta
  `py -m http.server 8777` sobre esta carpeta.

## Pendiente

1. **Falta ejecutar en Supabase** `sql/01_esquema.sql`, `sql/02_api.sql` y
   `sql/04_calendario.sql` (en ese orden) para que los cambios lleguen a la base
   de datos en vivo. Hasta entonces la web publicada seguirá con una sola
   jornada. Ese mismo `04` carga el calendario, deja la hora sin confirmar en las
   37 jornadas nuevas y **arregla de paso lo de Sangante** (portero → defensa),
   que vive en la base de datos y no en los ficheros.
2. **Credenciales de git**: el primer `push` tiene que lanzarlo el usuario en su
   propia terminal, porque aquí no se puede mostrar la ventana de acceso
   (`GIT_TERMINAL_PROMPT=0`, `GCM_INTERACTIVE=never`). Ya están configurados
   `credential.helper=manager` y `http.sslbackend=schannel`; en cuanto autorice
   una vez, los `push` desde aquí funcionan solos.
3. **Las horas de cada jornada** hay que irlas confirmando semana a semana desde
   Admin, según las publique LaLiga.
4. **La plantilla** es la lista oficial de dorsales, pendiente del cierre del
   mercado de fichajes de septiembre de 2026. Se ajusta desde Admin.
5. **Columnas `convocatoria` y `convocatoria_en`** en la tabla `jornadas`: están
   creadas en el esquema pero **no las usa ni el SQL ni la web**. La idea
   apuntada allí es que, con lista de convocados, solo se pueda alinear a esos.
   Sin implementar: preguntar al usuario antes de tocarlo.

## Cosas que no están aquí ni debes pedir

La contraseña de administrador y los PIN de los participantes no los sabe nadie
más que ellos: se guardan con hash y no se pueden consultar. Si hace falta
reiniciarlos, el `README.md` explica cómo.
