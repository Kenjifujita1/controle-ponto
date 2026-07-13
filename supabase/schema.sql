-- ============================================================
-- Controle de Ponto — esquema completo do banco (Supabase / Postgres)
-- Rode este arquivo inteiro num projeto Supabase NOVO (SQL Editor).
-- Tabelas prefixadas com `ponto_` para conviver com outros sistemas.
-- ============================================================
-- Modelo de acesso:
--   * admin / supervisor -> têm login (auth.users) + linha em `ponto_perfis`
--   * funcionário         -> NÃO tem login; é identificado na marcação
--                            por reconhecimento facial (1:N) ou PIN.
-- ============================================================

create extension if not exists pgcrypto;

-- ---------- Perfis de usuários do sistema (admin/supervisor) ----------
do $$ begin
  create type ponto_papel as enum ('admin', 'supervisor');
exception when duplicate_object then null; end $$;

create table if not exists ponto_perfis (
  id        uuid primary key references auth.users(id) on delete cascade,
  nome      text not null,
  papel     ponto_papel not null default 'supervisor',
  criado_em timestamptz not null default now()
);

-- ---------- Unidades / Locais de trabalho ----------
create table if not exists ponto_locais (
  id                 uuid primary key default gen_random_uuid(),
  nome               text not null,
  latitude           double precision,
  longitude          double precision,
  raio_metros        integer not null default 150,
  ips_permitidos     text[] not null default '{}',
  email_alertas      text,
  telefone_alertas   text,
  horas_limite_saida numeric not null default 10, -- avisar após N horas sem saída
  ativo              boolean not null default true,
  criado_em          timestamptz not null default now()
);

-- ---------- Equipes ----------
create table if not exists ponto_equipes (
  id            uuid primary key default gen_random_uuid(),
  nome          text not null,
  supervisor_id uuid references ponto_perfis(id) on delete set null,
  criado_em     timestamptz not null default now()
);

-- ---------- Funcionários ----------
create table if not exists ponto_funcionarios (
  id                 uuid primary key default gen_random_uuid(),
  nome               text not null,
  matricula          text unique,
  cpf                text,
  equipe_id          uuid references ponto_equipes(id) on delete set null,
  local_id           uuid references ponto_locais(id) on delete set null,
  pin_hash           text,
  face_descriptor    jsonb,               -- vetor de 128 floats (não é foto)
  jornada_diaria_min integer not null default 480,
  consentimento_em   timestamptz,         -- LGPD: quando autorizou a biometria
  consentimento_por  text,
  ativo              boolean not null default true,
  criado_em          timestamptz not null default now()
);
create index if not exists idx_ponto_func_equipe on ponto_funcionarios (equipe_id);
create index if not exists idx_ponto_func_ativo  on ponto_funcionarios (ativo);

-- ---------- Marcações de ponto ----------
do $$ begin
  create type ponto_tipo_marcacao as enum ('entrada', 'saida', 'inicio_intervalo', 'fim_intervalo');
exception when duplicate_object then null; end $$;
do $$ begin
  create type ponto_metodo_marcacao as enum ('facial', 'pin');
exception when duplicate_object then null; end $$;

create table if not exists ponto_marcacoes (
  id             uuid primary key default gen_random_uuid(),
  funcionario_id uuid not null references ponto_funcionarios(id) on delete cascade,
  tipo           ponto_tipo_marcacao not null,
  metodo         ponto_metodo_marcacao not null,
  registrado_em  timestamptz not null default now(),
  local_id       uuid references ponto_locais(id) on delete set null,
  latitude       double precision,
  longitude      double precision,
  distancia_m    integer,
  ip             text,
  confianca      double precision,
  local_valido   boolean not null default false,
  dispositivo    text,
  criado_em      timestamptz not null default now()
);
create index if not exists idx_ponto_marc_func on ponto_marcacoes (funcionario_id, registrado_em desc);
create index if not exists idx_ponto_marc_data on ponto_marcacoes (registrado_em desc);

-- ---------- Configuração (não-secreta) ----------
create table if not exists ponto_config (
  chave text primary key,
  valor jsonb not null
);
insert into ponto_config (chave, valor) values
  ('emails_admin_alerta', '[]'::jsonb),
  ('remetente_email',     '"onboarding@resend.dev"'::jsonb),
  ('remetente_nome',      '"Controle de Ponto"'::jsonb)
on conflict (chave) do nothing;

-- ---------- Segredos (só service_role lê: RLS ligado SEM políticas) ----------
create table if not exists ponto_secrets (
  chave text primary key,
  valor text not null
);
-- gera segredos internos (assinatura de token e chamada do cron)
insert into ponto_secrets (chave, valor) values
  ('token_secret', encode(gen_random_bytes(32), 'hex')),
  ('cron_secret',  encode(gen_random_bytes(24), 'hex'))
on conflict (chave) do nothing;

-- ---------- Alertas de esquecimento ----------
create table if not exists ponto_alertas (
  id             uuid primary key default gen_random_uuid(),
  funcionario_id uuid not null references ponto_funcionarios(id) on delete cascade,
  tipo           text not null,
  referente_a    date not null,
  detalhe        text,
  canais         text[] not null default '{}',
  destinatarios  text[] not null default '{}',
  enviado_em     timestamptz not null default now(),
  unique (funcionario_id, tipo, referente_a)
);
create index if not exists idx_ponto_alertas_data on ponto_alertas (referente_a desc);

-- ============================================================
-- Funções auxiliares
-- ============================================================
create or replace function ponto_eh_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists(select 1 from ponto_perfis where id = auth.uid() and papel = 'admin')
$$;

-- Define/atualiza o PIN de um funcionário (hash bcrypt). Só admin.
create or replace function ponto_definir_pin(func_id uuid, novo_pin text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not ponto_eh_admin() then raise exception 'sem permissão'; end if;
  if novo_pin is null or length(novo_pin) < 4 then raise exception 'PIN deve ter ao menos 4 dígitos'; end if;
  update ponto_funcionarios set pin_hash = crypt(novo_pin, gen_salt('bf')) where id = func_id;
end $$;

-- Indica se o Resend está configurado (sem expor a chave). Só admin.
create or replace function ponto_resend_configurado() returns boolean
language sql security definer set search_path = public as $$
  select ponto_eh_admin() and exists (
    select 1 from ponto_secrets where chave = 'resend_api_key' and length(valor) > 0
  )
$$;

-- Situação (tem rosto / tem PIN) sem expor descritor/hash.
create or replace view ponto_funcionarios_status as
  select f.id, (f.face_descriptor is not null) as tem_face, (f.pin_hash is not null) as tem_pin
  from ponto_funcionarios f;

-- ============================================================
-- Segurança (RLS)
-- ============================================================
alter table ponto_perfis        enable row level security;
alter table ponto_locais        enable row level security;
alter table ponto_equipes       enable row level security;
alter table ponto_funcionarios  enable row level security;
alter table ponto_marcacoes     enable row level security;
alter table ponto_config        enable row level security;
alter table ponto_secrets       enable row level security; -- sem políticas: só service_role
alter table ponto_alertas       enable row level security;

grant select on ponto_funcionarios_status to authenticated;

drop policy if exists perfis_self  on ponto_perfis;
drop policy if exists perfis_admin on ponto_perfis;
create policy perfis_self  on ponto_perfis for select using (id = auth.uid() or ponto_eh_admin());
create policy perfis_admin on ponto_perfis for all    using (ponto_eh_admin()) with check (ponto_eh_admin());

drop policy if exists locais_admin_all on ponto_locais;
drop policy if exists locais_read      on ponto_locais;
create policy locais_admin_all on ponto_locais for all    using (ponto_eh_admin()) with check (ponto_eh_admin());
create policy locais_read      on ponto_locais for select using (auth.uid() is not null);

drop policy if exists equipes_admin_all on ponto_equipes;
drop policy if exists equipes_read      on ponto_equipes;
create policy equipes_admin_all on ponto_equipes for all    using (ponto_eh_admin()) with check (ponto_eh_admin());
create policy equipes_read      on ponto_equipes for select using (auth.uid() is not null);

drop policy if exists func_admin_all  on ponto_funcionarios;
drop policy if exists func_supervisor on ponto_funcionarios;
create policy func_admin_all  on ponto_funcionarios for all   using (ponto_eh_admin()) with check (ponto_eh_admin());
create policy func_supervisor on ponto_funcionarios for select using (
  auth.uid() is not null and (
    ponto_eh_admin()
    or equipe_id in (select id from ponto_equipes where supervisor_id = auth.uid())
  )
);

drop policy if exists marc_admin_all  on ponto_marcacoes;
drop policy if exists marc_supervisor on ponto_marcacoes;
create policy marc_admin_all  on ponto_marcacoes for all using (ponto_eh_admin()) with check (ponto_eh_admin());
create policy marc_supervisor on ponto_marcacoes for select using (
  ponto_eh_admin()
  or funcionario_id in (
    select f.id from ponto_funcionarios f
    join ponto_equipes e on e.id = f.equipe_id
    where e.supervisor_id = auth.uid()
  )
);

drop policy if exists config_admin on ponto_config;
create policy config_admin on ponto_config for all using (ponto_eh_admin()) with check (ponto_eh_admin());

drop policy if exists alertas_admin      on ponto_alertas;
drop policy if exists alertas_supervisor on ponto_alertas;
create policy alertas_admin      on ponto_alertas for all using (ponto_eh_admin()) with check (ponto_eh_admin());
create policy alertas_supervisor on ponto_alertas for select using (
  ponto_eh_admin()
  or funcionario_id in (
    select f.id from ponto_funcionarios f
    join ponto_equipes e on e.id = f.equipe_id
    where e.supervisor_id = auth.uid()
  )
);

-- ============================================================
-- Observações
-- ============================================================
-- * As marcações (tela pública) passam pela Edge Function `marcar-ponto`,
--   que usa a service_role key. O papel `anon` nunca lê descritores/PINs.
-- * A verificação de esquecimentos é a Edge Function `verificar-ponto`,
--   agendada por pg_cron (ver README > "Agendamento").
-- * Para criar o primeiro admin e configurar o cron, ver README.
