# Controle de Ponto (white-label)

Marcação de ponto por **reconhecimento facial** (no navegador) ou **PIN**, com
validação de local por **GPS + Wi-Fi (IP)**, painel administrativo, monitor ao
vivo, espelho de ponto com exportação e **alertas de esquecimento por e-mail**.
PWA instalável no celular — sem loja de aplicativos. Backend em Supabase.

> Modelo pensado para **controle interno/gerencial**. Não substitui, por si só,
> um registrador de ponto homologado (no Brasil, Portaria MTP 671/2021).

## Recursos
- Marcação facial (on-device — a imagem nunca é enviada, só um vetor matemático) ou PIN.
- Identifica a pessoa e mostra **só a próxima ação válida** (entrada → intervalo/saída → …).
- Validação de presença por **GPS (raio)** ou **Wi-Fi (IP público)** — funciona no 5G.
- Multiunidade, equipes e níveis de acesso (admin / supervisor) com RLS.
- **Monitor** ao vivo (quem está presente, horas por período) e **espelho de ponto** (Excel/PDF).
- **Alertas de esquecimento** ("entrou e não bateu saída após X horas") por e-mail (Resend), via `pg_cron`.
- Conformidade LGPD: consentimento biométrico e opção de remover a biometria.

## Stack
Vite · React · TypeScript · Tailwind · @vladmandic/face-api · Supabase
(Postgres + Auth + Edge Functions + pg_cron) · vite-plugin-pwa. Deploy sugerido: Vercel.

---

## Personalização (white-label)
Toda a marca é configurada por variáveis de ambiente no `.env` — **sem tocar no código**:

| Variável | Efeito |
|---|---|
| `VITE_APP_NAME` | Nome exibido no app e no título da aba |
| `VITE_APP_HANDLE` | Texto opcional ao lado do nome (ex.: `sistema.suaempresa`). Vazio = oculto |
| `VITE_APP_BADGE` | Sigla do ícone/selo (2–3 letras). Vazio = iniciais do nome |

O **nome do remetente** dos e-mails vem da tela **Config** (ou da tabela `ponto_config`).
Para trocar o **ícone do app** (PWA): `APP_BADGE=XX APP_SUBTITLE=EMPRESA node scripts/gen-icons.mjs`.

---

## Instalação passo a passo

### 0. Pré-requisitos
- Node 18+ e a [Supabase CLI](https://supabase.com/docs/guides/cli) (`npm i -g supabase`).
- Uma conta Supabase e (opcional) uma conta Vercel.

### 1. Clonar e instalar
```bash
git clone <URL-DO-SEU-REPO> && cd controle-ponto
npm install            # também copia os modelos de IA para public/models
```

### 2. Criar o projeto Supabase
Crie um projeto novo em supabase.com. Anote a **URL** e a **anon key**
(Project Settings > API). Em **Database > Extensions**, ative **pg_cron** e **pg_net**.

### 3. Criar o banco
No **SQL Editor** do Supabase, cole e rode o conteúdo de [`supabase/schema.sql`](supabase/schema.sql).

### 4. Publicar as Edge Functions
```bash
supabase login
supabase link --project-ref <PROJECT_REF>
supabase functions deploy marcar-ponto
supabase functions deploy gestores
supabase functions deploy verificar-ponto --no-verify-jwt
```
> `verificar-ponto` usa `--no-verify-jwt` porque é chamada pelo cron (protegida por um segredo interno) e pelo admin logado. As outras duas mantêm o JWT.

### 5. Configurar `.env`
```bash
cp .env.example .env
# preencha VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY e (opcional) a marca
```

### 6. Bootstrap (admin + cron)
Abra [`supabase/bootstrap.sql`](supabase/bootstrap.sql), troque os `<PLACEHOLDERS>` e rode no SQL Editor:
- **Admin:** crie o usuário em *Authentication > Users > Add user* (marque *Auto Confirm*), depois rode o `insert into ponto_perfis ...` com o e-mail dele.
- **Cron:** rode o `cron.schedule(...)` com a `<PROJECT_REF>` para ativar a verificação a cada 30 min.
- **(Opcional) E-mail:** crie conta no [Resend](https://resend.com), gere a API key e salve em `ponto_secrets` (comando no arquivo). Para enviar a destinatários fora do seu e-mail, verifique um domínio no Resend.

### 7. Rodar / publicar
```bash
npm run dev            # desenvolvimento (câmera/GPS só em https ou localhost)
npm run build          # produção
```
Deploy na **Vercel**: importe o repositório, defina as variáveis de ambiente
(as mesmas do `.env`) e faça o deploy. O `vercel.json` já cuida das rotas do SPA.

> ⚠️ Câmera e GPS exigem **HTTPS** (ou `localhost`). No celular, use o deploy (Vercel) — o `localhost` da sua máquina não conta como seguro na rede.

---

## Uso rápido
- **Gestor:** acesse `/login` e entre com o admin criado. Cadastre **Unidades**
  (GPS/Wi-Fi + responsável), **Equipes**, **Gestores** e **Funcionários** (com
  captura facial e/ou PIN).
- **Funcionário:** abre a raiz do site → **Identificar** (rosto ou PIN) → toca na
  ação → pronto.
- **Monitor / Relatórios:** acompanhe presença, horas e exporte o espelho.

## Estrutura
```
src/
  branding.ts   marca via env (white-label)
  lib/          supabase, face-api, geolocalização, relatório de horas
  pages/        MarcarPonto, Login, admin/* (Monitor, Funcionários, Unidades, Relatórios, Config, Gestores)
  store/        auth (zustand)
supabase/
  schema.sql               esquema completo + RLS + funções
  bootstrap.sql            admin + agendamento do cron
  functions/marcar-ponto/  identificação facial/PIN + validação de local (2 etapas, token assinado)
  functions/gestores/      criar/resetar/remover gestores (admin, via Admin API)
  functions/verificar-ponto/  regra de esquecimento + e-mail (Resend) + cron
```

## Licença
Defina a licença que preferir antes de distribuir.
