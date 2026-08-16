-- Familia Rojiblanca 26/27 — esquema
-- Ejecutar en el SQL Editor de Supabase. Es idempotente: se puede volver a lanzar.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------- tablas ---

create table if not exists participantes (
  id        serial primary key,
  nombre    text not null unique,
  pin_hash  text,                       -- null = aun no ha fijado PIN
  activo    boolean not null default true,
  creado_en timestamptz not null default now()
);

-- Aviso por correo cuando se acerca el cierre y no has enviado tu once. Lo
-- activa cada uno si quiere, y se le pregunta la primera vez que entra.
--
-- El correo se guarda CIFRADO (ver sql/06_avisos.sql) y ninguna funcion de la
-- web lo devuelve en claro, ni siquiera al administrador: solo sale la pista
-- («j***@gmail.com»), que es lo que se guarda aparte en email_pista para poder
-- enseñarla sin descifrar nada.
alter table participantes add column if not exists email_cifrado     bytea;
alter table participantes add column if not exists email_pista       text;
alter table participantes add column if not exists avisos            boolean not null default false;
-- para no volver a preguntarle a quien ya dijo que no
alter table participantes add column if not exists avisos_preguntado boolean not null default false;

create table if not exists jugadores (
  id       serial primary key,
  dorsal   int,
  nombre   text not null,
  posicion text not null check (posicion in ('POR','DEF','MED','DEL')),
  activo   boolean not null default true
);

create table if not exists jornadas (
  id             serial primary key,
  numero         int not null unique check (numero between 1 and 38),
  rival          text not null,
  en_casa        boolean not null default true,
  kickoff        timestamptz not null,
  cierre         timestamptz not null,   -- por defecto kickoff - 1 hora
  prorroga_hasta timestamptz,            -- el admin puede empujar el cierre
  once_oficial   int[],                  -- null mientras no se publica
  publicada_en   timestamptz,
  -- LaLiga fija el dia y la hora exactos pocas semanas antes. Mientras tanto la
  -- jornada lleva una hora tentativa y esta marca a false, para avisar en la web.
  hora_confirmada boolean not null default false,
  -- Convocatoria del partido. null = no se conoce todavia y vale toda la
  -- plantilla; con lista, solo se puede alinear a los convocados.
  convocatoria    int[],
  convocatoria_en timestamptz,
  constraint once_oficial_11 check (once_oficial is null or array_length(once_oficial,1) = 11),
  constraint convocatoria_min check (convocatoria is null or array_length(convocatoria,1) >= 11)
);

-- para bases de datos creadas antes de que existieran las columnas
alter table jornadas add column if not exists hora_confirmada boolean not null default false;
alter table jornadas add column if not exists convocatoria        int[];
alter table jornadas add column if not exists convocatoria_en     timestamptz;
-- de donde salio: null = a mano, o la direccion de la noticia si la cargo el robot
alter table jornadas add column if not exists convocatoria_fuente text;

-- El once que ha leido el robot en la web del club. NO es el once oficial: es
-- una propuesta esperando a que el administrador la confirme, porque de ahi
-- salen los puntos.
alter table jornadas add column if not exists once_propuesto        int[];
alter table jornadas add column if not exists once_propuesto_en     timestamptz;
alter table jornadas add column if not exists once_propuesto_fuente text;

-- ultimo intento del robot y por que se volvio de vacio, para poder verlo en Admin
alter table jornadas add column if not exists once_robot_intento timestamptz;
alter table jornadas add column if not exists once_robot_motivo  text;

do $$ begin
  alter table jornadas add constraint convocatoria_min
    check (convocatoria is null or array_length(convocatoria,1) >= 11);
exception when duplicate_object then null;
end $$;

create table if not exists alineaciones (
  jornada_id      int not null references jornadas(id) on delete cascade,
  participante_id int not null references participantes(id) on delete cascade,
  picks           int[] not null,
  enviada_en      timestamptz not null default now(),
  actualizada_en  timestamptz not null default now(),
  primary key (jornada_id, participante_id),
  constraint picks_11 check (array_length(picks,1) = 11)
);

-- Un aviso por persona y jornada, y no mas: si el proceso se repite (o se lanza
-- a mano), aqui esta la constancia de lo ya enviado.
create table if not exists recordatorios (
  jornada_id      int not null references jornadas(id) on delete cascade,
  participante_id int not null references participantes(id) on delete cascade,
  enviado_en      timestamptz not null default now(),
  primary key (jornada_id, participante_id)
);

create table if not exists sesiones (
  token           uuid primary key default gen_random_uuid(),
  participante_id int references participantes(id) on delete cascade,
  es_admin        boolean not null default false,
  creada_en       timestamptz not null default now(),
  expira          timestamptz not null default now() + interval '60 days'
);

create table if not exists intentos_login (
  id              bigserial primary key,
  participante_id int,
  exito           boolean not null,
  cuando          timestamptz not null default now()
);
create index if not exists ix_intentos on intentos_login (participante_id, cuando desc);

-- clave/valor para la contrasena de administrador
create table if not exists config (
  clave text primary key,
  valor text not null
);

-- ------------------------------------------------------- cierre de acceso ---
-- Nadie puede tocar las tablas directamente con la clave publica de la web.
-- Todo pasa por las funciones de 02_api.sql, que validan PIN y hora de cierre.

alter table participantes  enable row level security;
alter table jugadores      enable row level security;
alter table jornadas       enable row level security;
alter table alineaciones   enable row level security;
alter table recordatorios  enable row level security;
alter table sesiones       enable row level security;
alter table intentos_login enable row level security;
alter table config         enable row level security;

revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
