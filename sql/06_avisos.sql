-- Familia Rojiblanca 26/27 — avisos por correo
--
-- Tres horas antes del partido, a quien no haya enviado su alineacion se le
-- manda un recordatorio. Es voluntario: cada uno pone su correo y lo enciende o
-- lo apaga cuando quiera.
--
-- El correo se guarda CIFRADO, y de ahi salen las dos mitades de este fichero:
--
--   * lo que puede llamar la web (api_avisos) escribe el correo cifrado, pero
--     NUNCA lo devuelve: lo unico que sale de aqui es la pista, «j***@gmail.com».
--     Ni el propio administrador puede leerlo.
--   * lo que puede llamar el proceso de GitHub (robot_avisos_*) si lo descifra,
--     porque tiene que mandar el correo. Esas funciones estan cerradas al rol
--     anonimo, igual que las de los otros dos robots, asi que con la clave
--     publica de la web no se llega a ellas.
--
-- La llave del cifrado vive en la tabla config, que tambien esta cerrada. Esto
-- protege de lo que puede pasar de verdad aqui: que el correo se escape por la
-- web, por la clave publica o por una copia de la tabla. No protege de quien
-- tenga la cadena de conexion entera a la base de datos — con eso se llega a
-- todo, y no hay forma de evitarlo si el aviso tiene que salir solo.
--
-- OJO: si se pierde la fila 'email_clave' de config, los correos guardados dejan
-- de poder descifrarse y hay que volver a pedirlos. No la borres.

-- ------------------------------------------------------------------ la llave ---

-- Solo la lee. Tiene que ser «stable» y no escribir nada, porque la llama
-- robot_avisos_pendientes, que tambien lo es: PostgreSQL no deja que una funcion
-- marcada como stable acabe escribiendo en una tabla. De crearla se encarga
-- api_avisos, que es la unica que la necesita antes de que exista.
create or replace function f_clave_email()
returns text language sql stable security definer
set search_path = public, extensions, pg_temp as $$
  select valor from config where clave = 'email_clave'
$$;

-- ---------------------------------------------------------------- la web ---
-- Pone, cambia, apaga o borra el correo del que ha iniciado sesion.
--
--   p_email = null            -> no se toca el correo, solo se encienden o
--                                apagan los avisos
--   p_email = ''              -> se borra el correo (y con el, los avisos)
--   p_email = 'x@y.z'         -> se guarda cifrado
--
-- En los tres casos queda constancia de que a esta persona ya se le ha
-- preguntado, para no darle la lata cada vez que entre.

create or replace function api_avisos(p_token uuid, p_email text, p_avisos boolean)
returns json language plpgsql security definer
set search_path = public, extensions, pg_temp as $$
declare
  v_yo    int;
  v_email text;
  v_avisos boolean;
  v_pista  text;
begin
  v_yo := f_participante(p_token);
  if v_yo is null then
    return json_build_object('ok', false, 'error', 'Sesion caducada, vuelve a entrar');
  end if;

  v_email := nullif(btrim(coalesce(p_email, '')), '');

  if v_email is null and p_email is not null then
    -- cadena vacia: quitar el correo
    update participantes
       set email_cifrado = null, email_pista = null,
           avisos = false, avisos_preguntado = true
     where id = v_yo;
    return json_build_object('ok', true, 'avisos', false, 'email_pista', null);
  end if;

  if v_email is not null then
    if length(v_email) > 254
       or v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]{2,}$' then
      return json_build_object('ok', false, 'error',
        'Ese correo no tiene buena pinta. Repasalo, tiene que ser del estilo nombre@correo.com');
    end if;

    v_pista := left(split_part(v_email, '@', 1), 1) || '***@' || split_part(v_email, '@', 2);

    -- la llave se genera sola la primera vez que alguien pone un correo
    insert into config (clave, valor)
    values ('email_clave', encode(gen_random_bytes(32), 'base64'))
    on conflict (clave) do nothing;

    update participantes
       set email_cifrado     = pgp_sym_encrypt(v_email, f_clave_email()),
           email_pista       = v_pista,
           avisos            = coalesce(p_avisos, true),
           avisos_preguntado = true
     where id = v_yo;
  else
    -- sin correo nuevo: solo se enciende o se apaga lo que ya hubiera
    update participantes
       set avisos            = coalesce(p_avisos, false) and email_cifrado is not null,
           avisos_preguntado = true
     where id = v_yo;
  end if;

  select avisos, email_pista into v_avisos, v_pista from participantes where id = v_yo;
  return json_build_object('ok', true, 'avisos', v_avisos, 'email_pista', v_pista);
end $$;

-- ------------------------------------------------------------- el proceso ---
-- A quien hay que escribir ahora mismo, y de que. Como en los otros robots,
-- quien decide es SQL: fuera de la ventana esto devuelve la lista vacia y el
-- proceso de GitHub se va en unos segundos sin mandar nada.
--
-- Hay dos clases de aviso, y las dos salen de aqui:
--
--   'convocatoria' en cuanto se sabe a quien ha convocado el Sevilla. Va a todo
--                  el que tenga avisos, haya enviado su once o no: al que no lo
--                  ha enviado le sirve de recordatorio, y al que si, para
--                  enterarse de si le han dejado fuera a alguno de los suyos.
--   'alineacion'   faltan menos de 3 horas y esa persona sigue sin enviar.
--
-- En los dos casos hace falta que sea el proximo partido (el unico al que se
-- puede alinear), que el plazo siga abierto y que no se conozca el once: si se
-- conoce, el plazo ya esta cerrado de hecho y el aviso solo fastidiaria.

create or replace function robot_avisos_pendientes()
returns json language sql stable security definer
set search_path = public, extensions, pg_temp as $$
  with j as (
    select * from jornadas
     where id = f_jornada_proxima()
       and once_oficial is null
       and once_propuesto is null
  ),
  gente as (
    select p.id, p.nombre, p.email_cifrado
      from participantes p
     where p.activo and p.avisos and p.email_cifrado is not null
  ),
  conv as (
    select g.*, 'convocatoria'::text as tipo, j.id as jornada_id
      from gente g, j
     where j.convocatoria is not null
       and not exists (select 1 from recordatorios r
                        where r.jornada_id = j.id and r.participante_id = g.id
                          and r.tipo = 'convocatoria')
  ),
  alin as (
    select g.*, 'alineacion'::text as tipo, j.id as jornada_id
      from gente g, j
     where now() >= j.kickoff - interval '3 hours'
       and not exists (select 1 from alineaciones a
                        where a.jornada_id = j.id and a.participante_id = g.id)
       and not exists (select 1 from recordatorios r
                        where r.jornada_id = j.id and r.participante_id = g.id
                          and r.tipo = 'alineacion')
       -- Si en este mismo pase le toca tambien el de la convocatoria, ese va
       -- primero y este espera al siguiente cuarto de hora: dos correos a la vez
       -- son un correo de mas, y el de la convocatoria ya le dice que todavia no
       -- ha enviado nada.
       and not exists (select 1 from conv c where c.id = g.id)
  ),
  todos as (select * from conv union all select * from alin)
  select json_build_object(
    'ahora', now(),
    -- Las horas van tambien pasadas a la de Madrid y ya escritas, para que el
    -- proceso no tenga que saber de husos ni de cambios de hora: eso lo sabe
    -- PostgreSQL, y Python tendria que traerse una base de datos de zonas.
    'hoy', to_char(now() at time zone 'Europe/Madrid', 'YYYY-MM-DD'),
    'jornada', (
      select json_build_object('id', id, 'numero', numero, 'rival', rival,
                               'en_casa', en_casa, 'kickoff', kickoff,
                               'hora_confirmada', hora_confirmada,
                               'cierre', f_cierre_efectivo(cierre, prorroga_hasta),
                               'kickoff_local',
                                 to_char(kickoff at time zone 'Europe/Madrid', 'YYYY-MM-DD HH24:MI'),
                               'cierre_local',
                                 to_char(f_cierre_efectivo(cierre, prorroga_hasta)
                                         at time zone 'Europe/Madrid', 'YYYY-MM-DD HH24:MI'),
                               -- los convocados, para poder ponerlos en el correo
                               'convocados', (
                                 select coalesce(json_agg(json_build_object(
                                          'dorsal', g.dorsal, 'nombre', g.nombre)
                                        order by array_position(array['POR','DEF','MED','DEL'], g.posicion),
                                                 g.dorsal), '[]'::json)
                                   from jugadores g where g.id = any(j.convocatoria)))
        from j),
    'avisos', (
      select coalesce(json_agg(json_build_object(
               'participante_id', t.id,
               'nombre',  t.nombre,
               'tipo',    t.tipo,
               'email',   pgp_sym_decrypt(t.email_cifrado, f_clave_email()),
               -- si ya mando su once, y a quien tiene puesto que se ha quedado
               -- sin convocar: con eso el correo le puede decir a cada uno lo suyo
               'enviada', exists (select 1 from alineaciones a
                                   where a.jornada_id = t.jornada_id
                                     and a.participante_id = t.id),
               'fuera', (
                 select coalesce(json_agg(g.nombre order by g.nombre), '[]'::json)
                   from alineaciones a
                   join jornadas jj on jj.id = a.jornada_id
                   join jugadores g on g.id = any(a.picks)
                  where a.jornada_id = t.jornada_id and a.participante_id = t.id
                    and jj.convocatoria is not null
                    and not (g.id = any(jj.convocatoria))))
             order by t.tipo, t.nombre), '[]'::json)
        from todos t)
  )
$$;

-- Se apunta DESPUES de que el correo haya salido de verdad: si el envio falla,
-- no se apunta nada y se vuelve a intentar en el siguiente pase.
--
-- Cambia la firma (le entra el tipo de aviso), asi que hay que retirar la
-- version antigua: si no, quedarian las dos.
drop function if exists robot_aviso_enviado(int, int);

create or replace function robot_aviso_enviado(p_jornada int, p_participante int, p_tipo text)
returns json language plpgsql security definer
set search_path = public, extensions, pg_temp as $$
begin
  insert into recordatorios (jornada_id, participante_id, tipo)
  values (p_jornada, p_participante, coalesce(nullif(p_tipo, ''), 'alineacion'))
  on conflict (jornada_id, participante_id, tipo) do nothing;
  return json_build_object('ok', true);
end $$;

-- ------------------------------------------------------------- permisos ---
-- api_avisos si la llama la web; lo demas, solo el proceso de GitHub con la
-- cadena de conexion. Como se explica en 05_robot.sql, no basta con quitarselo
-- a anon: PostgreSQL da execute a PUBLIC en cada funcion nueva y anon lo hereda.

grant  execute on function api_avisos(uuid, text, boolean)     to anon, authenticated;
revoke execute on function f_clave_email()                     from public, anon, authenticated;
revoke execute on function robot_avisos_pendientes()           from public, anon, authenticated;
revoke execute on function robot_aviso_enviado(int, int, text) from public, anon, authenticated;

-- Y se comprueba, que esto no puede quedarse a medias sin que nadie se entere.
do $$
declare v_abiertas text;
begin
  select string_agg(p.proname, ', ') into v_abiertas
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname in ('f_clave_email', 'robot_avisos_pendientes', 'robot_aviso_enviado')
     and (has_function_privilege('anon', p.oid, 'execute')
          or has_function_privilege('authenticated', p.oid, 'execute'));

  if v_abiertas is not null then
    raise exception 'Los avisos por correo siguen abiertos al rol anonimo: %', v_abiertas;
  end if;
end $$;
