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
ejecutar en el **SQL Editor** los ficheros `sql/01_esquema.sql`, `sql/02_api.sql`
y `sql/03_datos.sql` **en ese orden**, y copiar en `app/config.js` la *Project
URL* y la clave `anon public` de **Project Settings → API**.

> La clave `anon` es pública por diseño: va dentro de la web. La seguridad no
> depende de ella — todas las tablas están bloqueadas y solo se puede operar a
> través de las funciones controladas de `sql/02_api.sql`, que comprueban el PIN
> y la hora de cierre en el servidor.

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
  (cierre a las 20:30).
- Las posiciones de los jugadores solo se usan para dibujar el campo; la
  puntuación no depende de ellas.
