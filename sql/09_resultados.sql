-- Familia Rojiblanca 26/27 — el correo con los resultados de la jornada
--
-- En cuanto se conoce el once inicial (lo publique el robot o el administrador
-- a mano) y el plazo esta cerrado por el reloj, a cada participante con avisos
-- se le manda un correo con el once del Sevilla, lo que ha hecho el, la
-- clasificacion del dia y la general, y la imagen del resumen (la misma que
-- se comparte por WhatsApp) adjunta.
--
-- Quien decide si toca, como siempre, es SQL: esta funcion devuelve la jornada
-- y a quien hay que escribir, y el proceso de GitHub solo manda y apunta. Es el
-- mismo esquema que los otros avisos (06_avisos.sql): un correo por persona y
-- jornada, apuntado en «recordatorios» con tipo 'resultado' DESPUES de salir.
--
-- Solo se escribe de jornadas publicadas a partir de que esto se estreno
-- (config.resultados_desde, que se pone sola al aplicar este fichero): las
-- cinco jornadas anteriores ya estaban jugadas y no hay que mandar nada de
-- ellas. Para probar el correo sin esperar al partido, la funcion admite el
-- numero de una jornada ya jugada: entonces el correo va SOLO al administrador
-- y no se apunta nada.

insert into config (clave, valor) values ('resultados_desde', now()::text)
on conflict (clave) do nothing;

create or replace function robot_resultados_pendientes(p_prueba int default null)
returns json language plpgsql stable security definer
set search_path = public, extensions, pg_temp as $$
declare
  j        jornadas;
  v_cierre timestamptz;
  v_desde  timestamptz;
  v_admin  int;
  v_filas  json;
  v_avisos json;
begin
  select nullif(valor, '')::timestamptz into v_desde from config where clave = 'resultados_desde';
  select nullif(btrim(valor), '')::int  into v_admin from config where clave = 'admin_participante';

  if p_prueba is not null then
    -- modo prueba: una jornada ya jugada, la que se pida
    select * into j from jornadas where numero = p_prueba and once_oficial is not null;
  else
    -- la primera jornada puntuada, estrenada esta funcion, con alguien a quien
    -- todavia no se le haya escrito
    select jj.* into j
      from jornadas jj
     where jj.once_oficial is not null
       and jj.publicada_en >= coalesce(v_desde, now())
       and exists (select 1 from participantes p
                    where p.activo and p.avisos and p.email_cifrado is not null
                      and not exists (select 1 from recordatorios r
                                       where r.jornada_id = jj.id and r.participante_id = p.id
                                         and r.tipo = 'resultado'))
     order by jj.numero
     limit 1;
  end if;

  if j.id is null then
    return json_build_object('ahora', now(), 'jornada', null);
  end if;

  v_cierre := f_cierre_efectivo(j.cierre, j.prorroga_hasta);

  -- las mismas filas que api_jornada, con puesto (empates: 1, 1, 3…)
  select coalesce(json_agg(json_build_object(
           'participante_id', t.id,
           'nombre',   t.nombre,
           'participo', t.participo,
           'picks',    t.picks,
           'aciertos', t.aciertos,
           'puntos',   t.puntos,
           'puesto',   t.puesto)
         order by t.puesto, t.nombre), '[]'::json)
    into v_filas
    from (
      select s.*, rank() over (order by s.puntos desc) as puesto
        from (
          select p.id, p.nombre,
                 (a.jornada_id is not null) as participo,
                 a.picks,
                 case when a.picks is null then null
                      else f_aciertos(a.picks, j.once_oficial) end as aciertos,
                 case when a.picks is null then 0
                      else f_puntos(f_aciertos(a.picks, j.once_oficial)) end as puntos
            from participantes p
            left join alineaciones a on a.jornada_id = j.id and a.participante_id = p.id
           where p.activo) s) t;

  -- A quien se le escribe. Solo con el plazo cerrado por el reloj: es cuando la
  -- web revela las alineaciones de los demas, y el correo las lleva todas.
  select coalesce(json_agg(json_build_object(
           'participante_id', p.id,
           'nombre', p.nombre,
           'email',  pgp_sym_decrypt(p.email_cifrado, f_clave_email()))
         order by p.nombre), '[]'::json)
    into v_avisos
    from participantes p
   where p.activo and p.email_cifrado is not null
     and now() >= v_cierre
     and case when p_prueba is not null
              then p.id = v_admin
              else p.avisos
                   and not exists (select 1 from recordatorios r
                                    where r.jornada_id = j.id and r.participante_id = p.id
                                      and r.tipo = 'resultado')
         end;

  return json_build_object(
    'ahora',  now(),
    'hoy',    to_char(now() at time zone 'Europe/Madrid', 'YYYY-MM-DD'),
    'prueba', p_prueba is not null,
    'jornada', json_build_object(
      'id', j.id, 'numero', j.numero, 'rival', j.rival, 'en_casa', j.en_casa,
      'kickoff', j.kickoff,
      'kickoff_local', to_char(j.kickoff at time zone 'Europe/Madrid', 'YYYY-MM-DD HH24:MI'),
      'cierre', v_cierre,
      'cerrada', now() >= v_cierre,
      'once_oficial', j.once_oficial,
      'publicada_en', j.publicada_en),
    -- el once, en el orden en que se dibuja: portero, defensas, medios, delanteros
    'once', (
      select coalesce(json_agg(json_build_object(
               'id', g.id, 'dorsal', g.dorsal, 'nombre', g.nombre, 'posicion', g.posicion)
             order by array_position(array['POR','DEF','MED','DEL'], g.posicion), g.dorsal), '[]'::json)
        from jugadores g where g.id = any(j.once_oficial)),
    -- la plantilla entera (tambien los de baja: puede haber alineaciones con ellos)
    'jugadores', (
      select coalesce(json_agg(json_build_object(
               'id', id, 'nombre', nombre, 'dorsal', dorsal, 'posicion', posicion, 'activo', activo)
             order by id), '[]'::json)
        from jugadores),
    'filas',   v_filas,
    'general', api_general()->'tabla',
    'jornadas_jugadas', (select count(*) from jornadas where once_oficial is not null),
    'avisos',  v_avisos);
end $$;

-- De apuntar lo enviado se encarga robot_aviso_enviado(jornada, participante,
-- 'resultado'), la misma de los otros avisos (06_avisos.sql).

-- ------------------------------------------------------------- permisos ---
-- Solo el proceso de GitHub, con la cadena de conexion. Como se explica en
-- 05_robot.sql, no basta con quitarselo a anon: hay que retirarselo a PUBLIC, y
-- hay que hacerlo aqui porque el bucle del 05 ya ha pasado cuando se llega a
-- este fichero.
revoke execute on function robot_resultados_pendientes(int) from public, anon, authenticated;

do $$
declare v_abiertas text;
begin
  select string_agg(p.proname, ', ') into v_abiertas
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname = 'robot_resultados_pendientes'
     and (has_function_privilege('anon', p.oid, 'execute')
          or has_function_privilege('authenticated', p.oid, 'execute'));

  if v_abiertas is not null then
    raise exception 'El correo de resultados sigue abierto al rol anonimo: %', v_abiertas;
  end if;
end $$;
