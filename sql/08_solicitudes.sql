-- Familia Rojiblanca 26/27 — solicitudes para entrar en la porra
--
-- Hasta ahora los seis participantes estaban dados de alta a mano y no habia
-- forma de que entrara nadie mas sin que el administrador lo anadiera. Aqui se
-- abre la puerta: cualquiera puede pedir entrar desde la propia web (nombre,
-- PIN y, si quiere avisos, su correo) y el administrador aprueba o rechaza.
--
-- La solicitud NO es un participante. Vive en su propia tabla hasta que se
-- aprueba, y solo entonces se crea la fila en participantes. Es a proposito: asi
-- quien no esta aprobado no puede aparecer en la clasificacion, ni en la lista
-- de la pantalla de entrar, ni recibir avisos, ni contar como «no participo».
-- Con una columna «aprobado» dentro de participantes habria que acordarse de
-- filtrarla en media docena de sitios, y basta olvidarse de uno.
--
-- El PIN se guarda con el mismo hash que el de los participantes (bcrypt) y el
-- correo con el mismo cifrado que el de los avisos, asi que al aprobar solo hay
-- que mudar las columnas de sitio: nunca se maneja ni el PIN ni el correo en
-- claro mas que en el momento de escribirlos.
--
-- (la tabla solicitudes se crea en 01_esquema.sql, con las demas: api_estado la
-- consulta y ese fichero se aplica antes que este)

-- A quien se le avisa por correo cuando alguien pide entrar. Se guarda el id de
-- un participante y se reutiliza SU correo, ya cifrado, en vez de pedir otro
-- aparte. Se deja apuntado Jesus, que es el administrador, y se puede cambiar
-- desde el panel Admin; si ya estaba puesto, esto no lo pisa.
insert into config (clave, valor)
select 'admin_participante', p.id::text
  from participantes p
 where p.nombre = 'Jesús'
 order by p.id
 limit 1
on conflict (clave) do nothing;

-- ------------------------------------------------------------------ la web ---

-- Pedir entrar. La puede llamar cualquiera con la clave publica, asi que aqui
-- se valida todo y se le pone freno a las avalanchas.
create or replace function api_solicitar(p_nombre text, p_pin text, p_email text)
returns json language plpgsql security definer
set search_path = public, extensions, pg_temp as $$
declare
  v_nombre text;
  v_email  text;
  v_pista  text;
  v_n      int;
begin
  v_nombre := btrim(regexp_replace(coalesce(p_nombre, ''), '\s+', ' ', 'g'));

  if char_length(v_nombre) < 2 or char_length(v_nombre) > 30 then
    return json_build_object('ok', false, 'error',
      'El nombre tiene que tener entre 2 y 30 letras');
  end if;
  if v_nombre ~ '[[:cntrl:]<>]' then
    return json_build_object('ok', false, 'error', 'Ese nombre lleva caracteres raros');
  end if;
  if p_pin is null or p_pin !~ '^[0-9]{4}$' then
    return json_build_object('ok', false, 'error', 'El PIN son 4 digitos');
  end if;

  if exists (select 1 from participantes where lower(nombre) = lower(v_nombre)) then
    return json_build_object('ok', false, 'error',
      'Ya hay alguien con ese nombre en la porra. Si eres tu, entra eligiendolo en la lista.');
  end if;
  if exists (select 1 from solicitudes
              where estado = 'pendiente' and lower(nombre) = lower(v_nombre)) then
    return json_build_object('ok', false, 'error',
      'Ya hay una solicitud con ese nombre esperando a que la aprueben.');
  end if;

  -- Freno: ni una avalancha de solicitudes ni una cola que no se acabe nunca.
  select count(*) into v_n from solicitudes where creada_en > now() - interval '1 hour';
  if v_n >= 5 then
    return json_build_object('ok', false, 'error',
      'Se han pedido ya bastantes entradas en la ultima hora. Prueba dentro de un rato.');
  end if;
  select count(*) into v_n from solicitudes where estado = 'pendiente';
  if v_n >= 20 then
    return json_build_object('ok', false, 'error',
      'Hay demasiadas solicitudes esperando. Habla con el administrador.');
  end if;

  -- El correo es optativo: solo hace falta si se quieren los avisos. Se guarda
  -- cifrado desde el primer momento, igual que el de los participantes.
  v_email := nullif(btrim(coalesce(p_email, '')), '');
  if v_email is not null then
    if length(v_email) > 254
       or v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]{2,}$' then
      return json_build_object('ok', false, 'error',
        'Ese correo no tiene buena pinta. Repasalo, tiene que ser del estilo nombre@correo.com');
    end if;
    v_pista := left(split_part(v_email, '@', 1), 1) || '***@' || split_part(v_email, '@', 2);

    insert into config (clave, valor)
    values ('email_clave', encode(gen_random_bytes(32), 'base64'))
    on conflict (clave) do nothing;
  end if;

  insert into solicitudes (nombre, pin_hash, email_cifrado, email_pista, avisos)
  values (v_nombre, crypt(p_pin, gen_salt('bf')),
          case when v_email is null then null
               else pgp_sym_encrypt(v_email, f_clave_email()) end,
          v_pista, v_email is not null);

  return json_build_object('ok', true, 'nombre', v_nombre, 'email_pista', v_pista);
end $$;

-- ---------------------------------------------------------------- el admin ---

-- Aprobar o rechazar. Al aprobar, la solicitud se convierte en participante
-- mudando tal cual el hash del PIN y el correo cifrado: esa persona entra con el
-- mismo PIN que eligio al pedirlo, sin tener que volver a decir nada.
create or replace function api_admin_solicitud(p_token uuid, p_id int, p_aprobar boolean)
returns json language plpgsql security definer
set search_path = public, extensions, pg_temp as $$
declare s solicitudes; v_id int;
begin
  if not f_es_admin(p_token) then
    return json_build_object('ok', false, 'error', 'No autorizado');
  end if;

  select * into s from solicitudes where id = p_id for update;
  if not found then
    return json_build_object('ok', false, 'error', 'Solicitud no encontrada');
  end if;
  if s.estado <> 'pendiente' then
    return json_build_object('ok', false, 'error', 'Esa solicitud ya estaba resuelta');
  end if;

  if not coalesce(p_aprobar, false) then
    -- Rechazada: no hay ningun motivo para seguir guardandole el PIN ni el
    -- correo. Se queda el nombre y la fecha, para que conste que se pidio.
    update solicitudes
       set estado = 'rechazada', resuelta_en = now(),
           pin_hash = '', email_cifrado = null, email_pista = null, avisos = false
     where id = p_id;
    return json_build_object('ok', true, 'aprobada', false, 'nombre', s.nombre);
  end if;

  if exists (select 1 from participantes where lower(nombre) = lower(s.nombre)) then
    return json_build_object('ok', false, 'error',
      'Ya hay un participante con ese nombre: resuelvelo antes de aprobar esta');
  end if;

  -- avisos_preguntado a true: al pedir entrar ya dijo si queria avisos o no, y
  -- no hay que volver a preguntarselo la primera vez que entre.
  insert into participantes (nombre, pin_hash, email_cifrado, email_pista,
                             avisos, avisos_preguntado)
  values (s.nombre, s.pin_hash, s.email_cifrado, s.email_pista, s.avisos, true)
  returning id into v_id;

  update solicitudes set estado = 'aprobada', resuelta_en = now() where id = p_id;

  return json_build_object('ok', true, 'aprobada', true,
                           'nombre', s.nombre, 'participante_id', v_id);
end $$;

-- A quien se avisa cuando entra una solicitud. null = a nadie (y entonces el
-- proceso de GitHub lo dice en su resumen en vez de callarse).
create or replace function api_admin_avisar_a(p_token uuid, p_participante int)
returns json language plpgsql security definer
set search_path = public, extensions, pg_temp as $$
begin
  if not f_es_admin(p_token) then
    return json_build_object('ok', false, 'error', 'No autorizado');
  end if;

  if p_participante is null then
    delete from config where clave = 'admin_participante';
    return json_build_object('ok', true, 'participante_id', null);
  end if;

  if not exists (select 1 from participantes where id = p_participante and activo) then
    return json_build_object('ok', false, 'error', 'Ese participante no existe');
  end if;

  insert into config (clave, valor) values ('admin_participante', p_participante::text)
  on conflict (clave) do update set valor = excluded.valor;

  return json_build_object('ok', true, 'participante_id', p_participante);
end $$;

-- ------------------------------------------------------------- el proceso ---
-- Las solicitudes que todavia no se han avisado por correo, con la direccion
-- del administrador ya descifrada. Como en los demas robots, esto esta cerrado
-- al rol anonimo: solo se llama desde GitHub con la cadena de conexion.

create or replace function robot_solicitudes_pendientes()
returns json language sql stable security definer
set search_path = public, extensions, pg_temp as $$
  select json_build_object(
    'admin', (
      select json_build_object(
               'nombre', p.nombre,
               'email',  pgp_sym_decrypt(p.email_cifrado, f_clave_email()))
        from participantes p
       where p.id = (select nullif(btrim(valor), '')::int
                       from config where clave = 'admin_participante')
         and p.activo and p.email_cifrado is not null),
    'solicitudes', (
      select coalesce(json_agg(json_build_object(
               'id', id, 'nombre', nombre, 'avisos', avisos, 'email_pista', email_pista,
               'creada_local', to_char(creada_en at time zone 'Europe/Madrid',
                                       'YYYY-MM-DD HH24:MI'))
             order by creada_en), '[]'::json)
        from solicitudes
       where estado = 'pendiente' and avisado_en is null),
    'pendientes', (select count(*) from solicitudes where estado = 'pendiente')
  )
$$;

-- Se apunta DESPUES de que el correo salga: si falla, se reintenta en el
-- siguiente pase. Igual que los recordatorios de las alineaciones.
create or replace function robot_solicitud_avisada(p_id int)
returns json language plpgsql security definer
set search_path = public, extensions, pg_temp as $$
begin
  update solicitudes set avisado_en = now() where id = p_id and avisado_en is null;
  return json_build_object('ok', true);
end $$;

-- ------------------------------------------------------------- permisos ---
-- api_solicitar la llama cualquiera (es la puerta de entrada) y las api_admin_*
-- validan el token dentro. Lo del robot, solo el proceso de GitHub: como se
-- explica en 05_robot.sql, no basta con quitarselo a anon, hay que retirarselo
-- tambien a PUBLIC. Y hay que hacerlo aqui, porque 02_api.sql vuelve a dar
-- permiso a todas las funciones cada vez que se aplica y el bucle de
-- 05_robot.sql ya ha pasado cuando se llega a este fichero.

grant  execute on function api_solicitar(text, text, text)      to anon, authenticated;
grant  execute on function api_admin_solicitud(uuid, int, boolean) to anon, authenticated;
grant  execute on function api_admin_avisar_a(uuid, int)        to anon, authenticated;
revoke execute on function robot_solicitudes_pendientes()       from public, anon, authenticated;
revoke execute on function robot_solicitud_avisada(int)         from public, anon, authenticated;

-- Y se comprueba, que esto no puede quedarse a medias sin que nadie se entere.
do $$
declare v_abiertas text;
begin
  select string_agg(p.proname, ', ') into v_abiertas
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname in ('robot_solicitudes_pendientes', 'robot_solicitud_avisada')
     and (has_function_privilege('anon', p.oid, 'execute')
          or has_function_privilege('authenticated', p.oid, 'execute'));

  if v_abiertas is not null then
    raise exception 'El robot de las solicitudes sigue abierto al rol anonimo: %', v_abiertas;
  end if;
end $$;
