-- ============================================================
-- Bootstrap — rode APÓS o schema.sql e o deploy das Edge Functions.
-- Substitua os <PLACEHOLDERS> antes de executar.
-- ============================================================

-- ===== A) Primeiro administrador =====
-- Recomendado: crie o usuário pelo painel do Supabase primeiro:
--   Authentication > Users > "Add user" (e-mail + senha, marque "Auto Confirm user").
-- Depois rode isto (troque o e-mail) para dar o papel de admin:
insert into ponto_perfis (id, nome, papel)
select id, 'Administrador', 'admin'
from auth.users
where email = '<ADMIN_EMAIL>'
on conflict (id) do update set papel = 'admin';

-- ===== B) Agendamento da verificação de esquecimentos (pg_cron) =====
-- Ative as extensões pg_cron e pg_net no painel: Database > Extensions.
-- Troque <PROJECT_REF> pela referência do seu projeto (o subdomínio da URL do Supabase).
select cron.schedule(
  'ponto-verificar-esquecimentos',
  '*/30 * * * *',
  $$
    select net.http_post(
      url := 'https://<PROJECT_REF>.supabase.co/functions/v1/verificar-ponto',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-cron-secret', (select valor from ponto_secrets where chave = 'cron_secret')
      ),
      body := jsonb_build_object('acao', 'verificar')
    );
  $$
);

-- ===== C) (Opcional) Chave do Resend para enviar e-mails de alerta =====
-- Crie conta grátis em resend.com, gere uma API key e rode (troque a chave):
-- insert into ponto_secrets (chave, valor) values ('resend_api_key', '<RESEND_API_KEY>')
-- on conflict (chave) do update set valor = excluded.valor;
