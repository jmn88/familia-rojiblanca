-- Familia Rojiblanca 26/27 — API
--
-- Todo lo que hace la web pasa por estas funciones. Son SECURITY DEFINER: se
-- ejecutan con permisos del propietario, de modo que son las unicas que pueden
-- leer y escribir en unas tablas que estan cerradas a cal y canto. Aqui dentro,
-- y no en el navegador, se comprueban el PIN y la hora de cierre.

-- ---------------------------------------------------------------- helpers ---

create or replace function f_cierre_efectivo(p_cierre timestamptz, p_prorroga timestamptz)
returns timestamptz language sql immutable as $$
  select coalesce(greatest(p_cierre, p_prorroga), p_cierre)
$$;

create or replace function f_puntos(p_aciertos int)
returns int language sql immutable strict as $$
  select case p_aciertos
           when 11 then 100
           when 10 then 50
           when  9 then 25
           when  8 then 10
           when  7 then 5
           when  6 then 1
           else 0
         end
$$;

create or replace function f_aciertos(p_picks int[], p_oficial int[])
returns int language sql immutable strict as $$
  select count(*)::int from unnest(p_picks) x where x = any(p_oficial)
$$;

create or replace function f_participante(p_token uuid)
returns int language sql stable security definer
set search_path = public, extensions, pg_temp as $$
  select participante_id from sesiones
   where token = p_token and expira > now() and not es_admin
$$;

create or replace function f_es_admin(p_token uuid)
returns boolean language sql stable security definer
set search_path = public, extensions, pg_temp as $$
  select coalesce((select es_admin from sesiones where token = p_token and expira > now()), false)
$$;

-- El proximo partido: la jornada de numero mas bajo cuyo plazo sigue abierto.
-- Es la unica en la que se puede meter alineacion; las demas ni se ofrecen ni se
-- aceptan, para que nadie se lie enviando un once a la jornada equivocada.
create or replace function f_jornada_proxima()
returns int language sql stable security definer
set search_path = public, extensions, pg_temp as $$
  select id from jornadas
   where now() < f_cierre_efectivo(cierre, prorroga_hasta)
   order by numero
   limit 1
$$;

-- ------------------------------------------------------------------ estado ---

create or replace function api_estado(p_token uuid default null)
returns json language sql stable security definer
set search_path = public, extensions, pg_temp as $$
  select json_build_object(
    'ok', true,
    'ahora', now(),
    'participantes', (
      select coalesce(json_agg(json_build_object(
               'id', id, 'nombre', nombre, 'tiene_pin', pin_hash is not null)
             order by nombre), '[]'::json)
      from participantes where activo),
    'jugadores', (
      select coalesce(json_agg(json_build_object(
               'id', id, 'dorsal', dorsal, 'nombre', nombre, 'posicion', posicion, 'activo', activo)
             order by array_position(array['POR','DEF','MED','DEL'], posicion), dorsal), '[]'::json)
      from jugadores
      -- el admin ve tambien los desactivados, para poder recuperarlos
      where activo or f_es_admin(p_token)),
    'jornadas', (
      select coalesce(json_agg(json_build_object(
               'id', id, 'numero', numero, 'rival', rival, 'en_casa', en_casa,
               'kickoff', kickoff,
               'hora_confirmada', hora_confirmada,
               'cierre', f_cierre_efectivo(cierre, prorroga_hasta),
               'prorrogada', prorroga_hasta is not null,
               'cerrada', now() >= f_cierre_efectivo(cierre, prorroga_hasta),
               'es_proxima', id is not distinct from f_jornada_proxima(),
               'convocatoria', convocatoria,
               'tiene_propuesta', once_propuesto is not null,
               'publicada', once_oficial is not null)
             order by numero), '[]'::json)
      from jornadas),
    'sesion', (
      select json_build_object('participante_id', s.participante_id, 'es_admin', s.es_admin,
                               'nombre', p.nombre)
      from sesiones s left join participantes p on p.id = s.participante_id
      where s.token = p_token and s.expira > now())
  )
$$;

-- ------------------------------------------------------------------ login ---

create or replace function api_login(p_participante int, p_pin text)
returns json language plpgsql security definer
set search_path = public, extensions, pg_temp as $$
declare
  v       participantes;
  v_token uuid;
  v_fallos int;
  v_nuevo boolean;
begin
  if p_pin is null or p_pin !~ '^[0-9]{4}$' then
    return json_build_object('ok', false, 'error', 'El PIN son 4 digitos');
  end if;

  select * into v from participantes where id = p_participante and activo;
  if not found then
    return json_build_object('ok', false, 'error', 'Participante no valido');
  end if;

  select count(*) into v_fallos from intentos_login
   where participante_id = p_participante and not exito and cuando > now() - interval '15 minutes';
  if v_fallos >= 8 then
    return json_build_object('ok', false, 'error', 'Demasiados intentos fallidos, espera 15 minutos');
  end if;

  v_nuevo := v.pin_hash is null;
  if v_nuevo then
    update participantes set pin_hash = crypt(p_pin, gen_salt('bf')) where id = v.id;
  elsif v.pin_hash <> crypt(p_pin, v.pin_hash) then
    insert into intentos_login(participante_id, exito) values (p_participante, false);
    return json_build_object('ok', false, 'error', 'PIN incorrecto');
  end if;

  insert into intentos_login(participante_id, exito) values (p_participante, true);
  insert into sesiones(participante_id) values (v.id) returning token into v_token;

  return json_build_object('ok', true, 'token', v_token, 'nombre', v.nombre,
                           'participante_id', v.id, 'pin_nuevo', v_nuevo);
end $$;

create or replace function api_logout(p_token uuid)
returns json language sql security definer
set search_path = public, extensions, pg_temp as $$
  with x as (delete from sesiones where token = p_token returning 1)
  select json_build_object('ok', true)
$$;

-- ------------------------------------------------------------ alineaciones ---

create or replace function api_guardar(p_token uuid, p_jornada int, p_picks int[])
returns json language plpgsql security definer
set search_path = public, extensions, pg_temp as $$
declare
  v_yo int;
  j    jornadas;
  n    int;
begin
  v_yo := f_participante(p_token);
  if v_yo is null then
    return json_build_object('ok', false, 'error', 'Sesion caducada, vuelve a entrar');
  end if;

  select * into j from jornadas where id = p_jornada;
  if not found then
    return json_build_object('ok', false, 'error', 'Jornada no encontrada');
  end if;

  if now() >= f_cierre_efectivo(j.cierre, j.prorroga_hasta) then
    return json_build_object('ok', false, 'error', 'El plazo esta cerrado');
  end if;

  -- En cuanto se conoce el once (aunque sea solo la propuesta del robot, sin
  -- confirmar todavia) se corta el envio, aunque el reloj del cierre normal no
  -- haya llegado. El club a veces publica la alineacion minutos antes de que
  -- cierre el plazo, y no tendria sentido dejar cambiar el once ya sabiendo
  -- quien juega de verdad.
  if j.once_oficial is not null or j.once_propuesto is not null then
    return json_build_object('ok', false, 'error',
      'Ya se conoce el once del Sevilla: el plazo se ha cerrado antes de tiempo');
  end if;

  -- Solo se juega al proximo partido. Aunque alguien trastee la pagina para
  -- mandar un once a una jornada de dentro de tres meses, aqui se rechaza.
  if j.id <> f_jornada_proxima() then
    return json_build_object('ok', false, 'error',
      'Solo se puede enviar la alineacion del proximo partido');
  end if;

  if coalesce(array_length(p_picks, 1), 0) <> 11 then
    return json_build_object('ok', false, 'error', 'Tienes que elegir exactamente 11 jugadores');
  end if;

  select count(distinct x) into n from unnest(p_picks) x;
  if n <> 11 then
    return json_build_object('ok', false, 'error', 'Hay jugadores repetidos');
  end if;

  select count(*) into n from jugadores where id = any(p_picks) and activo;
  if n <> 11 then
    return json_build_object('ok', false, 'error', 'Algun jugador no esta en la plantilla');
  end if;

  -- Con la convocatoria cargada, el once sale de ella y de ningun otro sitio.
  -- Sin convocatoria (null) vale toda la plantilla, como toda la vida.
  if j.convocatoria is not null
     and exists (select 1 from unnest(p_picks) x where not (x = any(j.convocatoria))) then
    return json_build_object('ok', false, 'error',
      'Solo puedes alinear a jugadores de la convocatoria');
  end if;

  insert into alineaciones (jornada_id, participante_id, picks)
  values (p_jornada, v_yo, p_picks)
  on conflict (jornada_id, participante_id)
  do update set picks = excluded.picks, actualizada_en = now();

  return json_build_object('ok', true, 'guardada_en', now());
end $$;

-- Detalle de una jornada. Antes del cierre solo devuelve tu propia alineacion
-- y quien ha enviado ya; los onces ajenos no salen de la base de datos.
create or replace function api_jornada(p_jornada int, p_token uuid default null)
returns json language plpgsql stable security definer
set search_path = public, extensions, pg_temp as $$
declare
  j         jornadas;
  v_cierre  timestamptz;
  v_cerrada boolean;
  v_yo      int;
  v_filas   json;
begin
  select * into j from jornadas where id = p_jornada;
  if not found then
    return json_build_object('ok', false, 'error', 'Jornada no encontrada');
  end if;

  v_cierre  := f_cierre_efectivo(j.cierre, j.prorroga_hasta);
  v_cerrada := now() >= v_cierre;
  v_yo      := f_participante(p_token);

  select coalesce(json_agg(json_build_object(
           'participante_id', t.id,
           'nombre',         t.nombre,
           'participo',      t.participo,
           'picks',          t.picks,
           'aciertos',       t.aciertos,
           'puntos',         t.puntos,
           'enviada_en',     t.enviada_en,
           'actualizada_en', t.actualizada_en)
         order by t.orden, t.nombre), '[]'::json)
    into v_filas
  from (
    select p.id, p.nombre,
           (a.jornada_id is not null) as participo,
           case when v_cerrada or p.id = v_yo then a.picks end as picks,
           case when j.once_oficial is null then null
                else f_aciertos(a.picks, j.once_oficial) end as aciertos,
           case when j.once_oficial is null then null
                when a.picks is null then 0
                else f_puntos(f_aciertos(a.picks, j.once_oficial)) end as puntos,
           -- las horas de envio se revelan con las alineaciones: al cierre, o
           -- las tuyas propias antes
           case when v_cerrada or p.id = v_yo then a.enviada_en end as enviada_en,
           case when v_cerrada or p.id = v_yo then a.actualizada_en end as actualizada_en,
           case when j.once_oficial is null then 0
                when a.picks is null then 0
                else -f_puntos(f_aciertos(a.picks, j.once_oficial)) end as orden
      from participantes p
      left join alineaciones a on a.jornada_id = j.id and a.participante_id = p.id
     where p.activo
  ) t;

  return json_build_object(
    'ok', true,
    'jornada', json_build_object(
      'id', j.id, 'numero', j.numero, 'rival', j.rival, 'en_casa', j.en_casa,
      'kickoff', j.kickoff, 'hora_confirmada', j.hora_confirmada,
      'cierre', v_cierre, 'prorrogada', j.prorroga_hasta is not null,
      'cerrada', v_cerrada, 'es_proxima', j.id is not distinct from f_jornada_proxima(),
      'convocatoria', j.convocatoria, 'convocatoria_en', j.convocatoria_en,
      'convocatoria_fuente', j.convocatoria_fuente,
      'once_oficial', j.once_oficial,
      'once_propuesto', j.once_propuesto, 'once_propuesto_fuente', j.once_propuesto_fuente,
      'once_robot_intento', j.once_robot_intento, 'once_robot_motivo', j.once_robot_motivo,
      'publicada', j.once_oficial is not null, 'publicada_en', j.publicada_en),
    'filas', v_filas);
end $$;

-- ---------------------------------------------------------------- general ---

create or replace function api_general()
returns json language sql stable security definer
set search_path = public, extensions, pg_temp as $$
  with base as (
    select p.id, p.nombre, j.numero,
           (a.jornada_id is not null) as participo,
           case when a.picks is null then 0
                else f_puntos(f_aciertos(a.picks, j.once_oficial)) end as puntos,
           f_aciertos(a.picks, j.once_oficial) as aciertos
      from participantes p
      cross join jornadas j
      left join alineaciones a on a.jornada_id = j.id and a.participante_id = p.id
     where p.activo and j.once_oficial is not null
  ),
  tot as (
    select p.id, p.nombre,
           coalesce(sum(b.puntos), 0)::int          as puntos,
           count(*) filter (where b.participo)::int as jugadas,
           coalesce(sum(b.aciertos), 0)::int        as aciertos,
           coalesce(max(b.puntos), 0)::int          as mejor
      from participantes p
      left join base b on b.id = p.id
     where p.activo
     group by p.id, p.nombre
  )
  select json_build_object(
    'ok', true,
    'tabla', (
      select coalesce(json_agg(json_build_object(
               'puesto', r.puesto, 'participante_id', r.id, 'nombre', r.nombre,
               'puntos', r.puntos, 'jugadas', r.jugadas,
               'aciertos', r.aciertos, 'mejor', r.mejor)
             order by r.puntos desc, r.nombre), '[]'::json)
      from (select t.*, rank() over (order by t.puntos desc) as puesto from tot t) r),
    'detalle', (
      select coalesce(json_agg(json_build_object(
               'participante_id', b.id, 'numero', b.numero,
               'puntos', b.puntos, 'aciertos', b.aciertos, 'participo', b.participo)), '[]'::json)
      from base b)
  )
$$;

-- ------------------------------------------------------------------ admin ---

create or replace function api_admin_login(p_pass text)
returns json language plpgsql security definer
set search_path = public, extensions, pg_temp as $$
declare v_hash text; v_token uuid; v_fallos int; v_nueva boolean;
begin
  if length(coalesce(p_pass, '')) < 6 then
    return json_build_object('ok', false, 'error', 'La contrasena debe tener al menos 6 caracteres');
  end if;

  select count(*) into v_fallos from intentos_login
   where participante_id is null and not exito and cuando > now() - interval '15 minutes';
  if v_fallos >= 8 then
    return json_build_object('ok', false, 'error', 'Demasiados intentos fallidos, espera 15 minutos');
  end if;

  select valor into v_hash from config where clave = 'admin_pass_hash';
  v_nueva := v_hash is null;

  if v_nueva then
    insert into config (clave, valor) values ('admin_pass_hash', crypt(p_pass, gen_salt('bf')));
  elsif v_hash <> crypt(p_pass, v_hash) then
    insert into intentos_login(participante_id, exito) values (null, false);
    return json_build_object('ok', false, 'error', 'Contrasena incorrecta');
  end if;

  insert into intentos_login(participante_id, exito) values (null, true);
  insert into sesiones(participante_id, es_admin) values (null, true) returning token into v_token;
  return json_build_object('ok', true, 'token', v_token, 'password_nueva', v_nueva);
end $$;

-- Cambia la firma (se le anade p_hora_confirmada), asi que hay que retirar la
-- version antigua: si no, quedarian las dos y PostgREST no sabria cual llamar.
drop function if exists api_admin_jornada(uuid, int, int, text, boolean, timestamptz, int);

create or replace function api_admin_jornada(
  p_token uuid, p_id int, p_numero int, p_rival text,
  p_en_casa boolean, p_kickoff timestamptz, p_minutos_antes int default 60,
  p_hora_confirmada boolean default false)
returns json language plpgsql security definer
set search_path = public, extensions, pg_temp as $$
declare v_cierre timestamptz; v_id int;
begin
  if not f_es_admin(p_token) then return json_build_object('ok', false, 'error', 'No autorizado'); end if;
  if p_numero is null or p_numero < 1 or p_numero > 38 then
    return json_build_object('ok', false, 'error', 'La jornada va de 1 a 38');
  end if;
  if coalesce(trim(p_rival), '') = '' then
    return json_build_object('ok', false, 'error', 'Falta el rival');
  end if;

  v_cierre := p_kickoff - make_interval(mins => coalesce(p_minutos_antes, 60));

  if p_id is null then
    insert into jornadas (numero, rival, en_casa, kickoff, cierre, hora_confirmada)
    values (p_numero, trim(p_rival), p_en_casa, p_kickoff, v_cierre, coalesce(p_hora_confirmada, false))
    on conflict (numero) do update
      set rival = excluded.rival, en_casa = excluded.en_casa,
          kickoff = excluded.kickoff, cierre = excluded.cierre,
          hora_confirmada = excluded.hora_confirmada
    returning id into v_id;
  else
    update jornadas set numero = p_numero, rival = trim(p_rival), en_casa = p_en_casa,
                        kickoff = p_kickoff, cierre = v_cierre,
                        hora_confirmada = coalesce(p_hora_confirmada, false)
     where id = p_id returning id into v_id;
  end if;

  return json_build_object('ok', true, 'id', v_id, 'cierre', v_cierre);
end $$;

create or replace function api_admin_prorrogar(p_token uuid, p_jornada int, p_minutos int)
returns json language plpgsql security definer
set search_path = public, extensions, pg_temp as $$
declare v timestamptz;
begin
  if not f_es_admin(p_token) then return json_build_object('ok', false, 'error', 'No autorizado'); end if;

  update jornadas
     set prorroga_hasta = greatest(f_cierre_efectivo(cierre, prorroga_hasta), now())
                          + make_interval(mins => p_minutos)
   where id = p_jornada
   returning prorroga_hasta into v;

  if v is null then return json_build_object('ok', false, 'error', 'Jornada no encontrada'); end if;
  return json_build_object('ok', true, 'cierre', v);
end $$;

-- ---------------------------------------------------------- convocatoria ---
-- La lista de convocados del partido. Mientras esta puesta, ni los
-- participantes ni el propio administrador pueden alinear a nadie de fuera.
-- Quitarla (p_jugadores null) deja otra vez disponible toda la plantilla.

create or replace function api_admin_convocatoria(p_token uuid, p_jornada int, p_jugadores int[])
returns json language plpgsql security definer
set search_path = public, extensions, pg_temp as $$
declare n int; v_total int; v_afectadas int; v_id int;
begin
  if not f_es_admin(p_token) then return json_build_object('ok', false, 'error', 'No autorizado'); end if;

  if p_jugadores is null then
    update jornadas set convocatoria = null, convocatoria_en = null, convocatoria_fuente = null
     where id = p_jornada returning id into v_id;
    if v_id is null then return json_build_object('ok', false, 'error', 'Jornada no encontrada'); end if;
    return json_build_object('ok', true, 'convocatoria', false);
  end if;

  v_total := coalesce(array_length(p_jugadores, 1), 0);
  if v_total < 11 then
    return json_build_object('ok', false, 'error',
      'La convocatoria necesita 11 jugadores como minimo');
  end if;

  select count(distinct x) into n from unnest(p_jugadores) x;
  if n <> v_total then return json_build_object('ok', false, 'error', 'Hay jugadores repetidos'); end if;

  select count(*) into n from jugadores where id = any(p_jugadores) and activo;
  if n <> v_total then
    return json_build_object('ok', false, 'error', 'Algun jugador no esta en la plantilla');
  end if;

  -- Alineaciones ya enviadas que se quedan fuera de juego: no se tocan (nadie
  -- borra el once de nadie), pero se avisa al administrador de cuantas son.
  select count(*) into v_afectadas
    from alineaciones a
   where a.jornada_id = p_jornada
     and exists (select 1 from unnest(a.picks) x where not (x = any(p_jugadores)));

  -- guardada por una persona: deja de constar como cargada sola, aunque
  -- lo unico que haya hecho el administrador sea repasarla y confirmarla
  update jornadas set convocatoria = p_jugadores, convocatoria_en = now(),
                      convocatoria_fuente = null
   where id = p_jornada returning id into v_id;
  if v_id is null then return json_build_object('ok', false, 'error', 'Jornada no encontrada'); end if;

  return json_build_object('ok', true, 'convocatoria', true,
                           'jugadores', v_total, 'afectadas', v_afectadas);
end $$;

create or replace function api_admin_once(p_token uuid, p_jornada int, p_picks int[])
returns json language plpgsql security definer
set search_path = public, extensions, pg_temp as $$
declare n int; v_conv int[];
begin
  if not f_es_admin(p_token) then return json_build_object('ok', false, 'error', 'No autorizado'); end if;

  if p_picks is null then           -- despublicar
    update jornadas set once_oficial = null, publicada_en = null where id = p_jornada;
    return json_build_object('ok', true, 'publicada', false);
  end if;

  if coalesce(array_length(p_picks, 1), 0) <> 11 then
    return json_build_object('ok', false, 'error', 'El once oficial son 11 jugadores');
  end if;
  select count(distinct x) into n from unnest(p_picks) x;
  if n <> 11 then return json_build_object('ok', false, 'error', 'Hay jugadores repetidos'); end if;
  select count(*) into n from jugadores where id = any(p_picks);
  if n <> 11 then return json_build_object('ok', false, 'error', 'Algun jugador no existe'); end if;

  -- Si hay convocatoria, el once inicial tiene que salir de ella. Si de verdad
  -- jugo alguien que no figuraba, lo que esta mal es la convocatoria: se corrige
  -- primero ahi, y asi nadie queda penalizado por un error de lectura.
  select convocatoria into v_conv from jornadas where id = p_jornada;
  if v_conv is not null
     and exists (select 1 from unnest(p_picks) x where not (x = any(v_conv))) then
    return json_build_object('ok', false, 'error',
      'El once oficial tiene jugadores que no estaban convocados. Corrige antes la convocatoria.');
  end if;

  -- decide una persona: la propuesta del robot ya ha cumplido su papel
  update jornadas set once_oficial = p_picks, publicada_en = now(),
                      once_propuesto = null, once_propuesto_en = null,
                      once_propuesto_fuente = null
   where id = p_jornada;
  return json_build_object('ok', true, 'publicada', true);
end $$;

create or replace function api_admin_reset_pin(p_token uuid, p_participante int)
returns json language plpgsql security definer
set search_path = public, extensions, pg_temp as $$
begin
  if not f_es_admin(p_token) then return json_build_object('ok', false, 'error', 'No autorizado'); end if;
  update participantes set pin_hash = null where id = p_participante;
  delete from sesiones where participante_id = p_participante;
  delete from intentos_login where participante_id = p_participante;
  return json_build_object('ok', true);
end $$;

create or replace function api_admin_jugador(
  p_token uuid, p_id int, p_dorsal int, p_nombre text, p_posicion text, p_activo boolean)
returns json language plpgsql security definer
set search_path = public, extensions, pg_temp as $$
declare v_id int;
begin
  if not f_es_admin(p_token) then return json_build_object('ok', false, 'error', 'No autorizado'); end if;
  if coalesce(trim(p_nombre), '') = '' then
    return json_build_object('ok', false, 'error', 'Falta el nombre');
  end if;
  if p_posicion not in ('POR','DEF','MED','DEL') then
    return json_build_object('ok', false, 'error', 'Posicion no valida');
  end if;

  if p_id is null then
    insert into jugadores (dorsal, nombre, posicion, activo)
    values (p_dorsal, trim(p_nombre), p_posicion, coalesce(p_activo, true))
    returning id into v_id;
  else
    update jugadores set dorsal = p_dorsal, nombre = trim(p_nombre),
                         posicion = p_posicion, activo = coalesce(p_activo, true)
     where id = p_id returning id into v_id;
  end if;
  return json_build_object('ok', true, 'id', v_id);
end $$;

create or replace function api_admin_participante(
  p_token uuid, p_id int, p_nombre text, p_activo boolean)
returns json language plpgsql security definer
set search_path = public, extensions, pg_temp as $$
declare v_id int;
begin
  if not f_es_admin(p_token) then return json_build_object('ok', false, 'error', 'No autorizado'); end if;
  if coalesce(trim(p_nombre), '') = '' then
    return json_build_object('ok', false, 'error', 'Falta el nombre');
  end if;

  if p_id is null then
    insert into participantes (nombre, activo) values (trim(p_nombre), coalesce(p_activo, true))
    returning id into v_id;
  else
    update participantes set nombre = trim(p_nombre), activo = coalesce(p_activo, true)
     where id = p_id returning id into v_id;
  end if;
  return json_build_object('ok', true, 'id', v_id);
end $$;

-- La web solo puede llamar a estas funciones; las tablas siguen cerradas.
grant execute on all functions in schema public to anon, authenticated;
