// Edge Function: verificar-ponto
// Varre marcações e detecta quem "entrou e não bateu a saída após X horas".
// Cria alertas (sem duplicar no mesmo dia) e envia e-mail via Resend.
// Autorização: header x-cron-secret (execução do pg_cron) OU JWT de admin (manual).
import { createClient } from 'jsr:@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type, x-cron-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  })
}

function dataSP(d: Date): string {
  return d.toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })
}
function horaSP(d: Date): string {
  return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' })
}

async function enviarEmail(
  apiKey: string,
  from: string,
  to: string[],
  subject: string,
  html: string,
): Promise<boolean> {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from, to, subject, html }),
  })
  return res.ok
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ erro: 'Método não permitido' }, 405)

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  // ---- segredos e config ----
  const { data: segredos } = await admin.from('ponto_secrets').select('chave, valor')
  const seg: Record<string, string> = {}
  for (const s of segredos ?? []) seg[s.chave] = s.valor
  const { data: cfgRows } = await admin.from('ponto_config').select('chave, valor')
  const cfg: Record<string, unknown> = {}
  for (const c of cfgRows ?? []) cfg[c.chave] = c.valor

  // ---- autorização ----
  const cronHeader = req.headers.get('x-cron-secret')
  let autorizado = !!cronHeader && cronHeader === seg['cron_secret']
  if (!autorizado) {
    const token = req.headers.get('Authorization')?.replace('Bearer ', '') ?? ''
    const { data: u } = await admin.auth.getUser(token)
    if (u.user) {
      const { data: p } = await admin.from('ponto_perfis').select('papel').eq('id', u.user.id).maybeSingle()
      autorizado = p?.papel === 'admin'
    }
  }
  if (!autorizado) return json({ erro: 'Não autorizado' }, 403)

  let body: any = {}
  try { body = await req.json() } catch { /* corpo opcional */ }
  const acao = body.acao ?? 'verificar'

  const apiKey = seg['resend_api_key'] ?? ''
  const marca = (cfg['remetente_nome'] as string) ?? 'Controle de Ponto'
  const remetente = `${marca} <${(cfg['remetente_email'] as string) ?? 'onboarding@resend.dev'}>`
  const emailsAdmin: string[] = Array.isArray(cfg['emails_admin_alerta']) ? (cfg['emails_admin_alerta'] as string[]) : []

  // ---- teste de e-mail ----
  if (acao === 'testar') {
    const para = body.para || emailsAdmin[0]
    if (!apiKey) return json({ erro: 'Resend não configurado (falta a API key).' }, 400)
    if (!para) return json({ erro: 'Nenhum e-mail de destino informado.' }, 400)
    const ok = await enviarEmail(apiKey, remetente, [para],
      `Teste — ${marca}`,
      `<p>✅ Este é um e-mail de teste do <strong>${marca}</strong>. Se você recebeu, os alertas de ponto estão funcionando.</p>`)
    return ok ? json({ ok: true, para }) : json({ erro: 'Resend recusou o envio (verifique a key/remetente).' }, 400)
  }

  // ---- verificação de esquecimentos ----
  const agora = new Date()
  const desde = new Date(agora.getTime() - 48 * 3600 * 1000).toISOString()

  const { data: funcs } = await admin
    .from('ponto_funcionarios')
    .select('id, nome, local_id')
    .eq('ativo', true)
  const { data: locais } = await admin
    .from('ponto_locais')
    .select('id, nome, horas_limite_saida, email_alertas')
  const mapLocal: Record<string, any> = {}
  for (const l of locais ?? []) mapLocal[l.id] = l

  const { data: marcs } = await admin
    .from('ponto_marcacoes')
    .select('funcionario_id, tipo, registrado_em')
    .gte('registrado_em', desde)
    .order('registrado_em', { ascending: true })

  const porFunc: Record<string, { tipo: string; t: number }[]> = {}
  for (const m of marcs ?? []) {
    ;(porFunc[m.funcionario_id] ??= []).push({ tipo: m.tipo, t: new Date(m.registrado_em).getTime() })
  }

  let novos = 0
  let enviados = 0
  const detalhes: string[] = []

  for (const f of funcs ?? []) {
    const evs = porFunc[f.id] ?? []
    // última entrada sem saída posterior
    let entradaAberta: number | null = null
    for (const e of evs) {
      if (e.tipo === 'entrada') entradaAberta = e.t
      else if (e.tipo === 'saida') entradaAberta = null
    }
    if (entradaAberta == null) continue

    const local = f.local_id ? mapLocal[f.local_id] : null
    const limiteH = Number(local?.horas_limite_saida ?? 10)
    const horasAberto = (agora.getTime() - entradaAberta) / 3600000
    if (horasAberto < limiteH) continue

    const dataRef = dataSP(new Date(entradaAberta))
    const destinatarios = [
      ...(local?.email_alertas ? [local.email_alertas] : []),
      ...emailsAdmin,
    ].filter((v, i, a) => v && a.indexOf(v) === i)

    const detalhe = `${f.nome} entrou às ${horaSP(new Date(entradaAberta))} e não registrou saída (${Math.floor(horasAberto)}h em aberto).`

    // insere sem duplicar no mesmo dia
    const { data: ins } = await admin
      .from('ponto_alertas')
      .upsert(
        { funcionario_id: f.id, tipo: 'esqueceu_saida', referente_a: dataRef, detalhe, canais: apiKey ? ['email'] : [], destinatarios },
        { onConflict: 'funcionario_id,tipo,referente_a', ignoreDuplicates: true },
      )
      .select('id')

    if (!ins || ins.length === 0) continue // já existia hoje
    novos++
    detalhes.push(detalhe)

    if (apiKey && destinatarios.length) {
      const html = `<p>⚠️ <strong>Esquecimento de ponto</strong></p><p>${detalhe}</p>
        <p>Unidade: ${local?.nome ?? '—'}</p>
        <p style="color:#888;font-size:12px">${marca} — verificação automática de ponto</p>`
      const ok = await enviarEmail(apiKey, remetente, destinatarios,
        `⚠️ ${f.nome} esqueceu de bater a saída`, html)
      if (ok) enviados++
    }
  }

  return json({ ok: true, verificados: (funcs ?? []).length, novos_alertas: novos, emails_enviados: enviados, detalhes })
})
