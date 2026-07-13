// Edge Function: marcar-ponto (duas etapas)
//  - acao 'identificar': reconhece a pessoa (facial 1:N ou PIN) e devolve APENAS
//    as próximas ações válidas + um token assinado (não grava nada).
//  - acao 'registrar': recebe o token + a ação escolhida, revalida e grava.
// Assim o funcionário nunca vê uma opção errada e o facial continua seguro.
import { createClient } from 'jsr:@supabase/supabase-js@2'
import bcrypt from 'npm:bcryptjs@2.4.3'

const LIMIAR_MATCH = 0.5
const TOKEN_TTL_MS = 120_000 // 2 min para confirmar

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })
}

function distancia(a: number[], b: number[]): number {
  let s = 0
  for (let i = 0; i < a.length; i++) { const d = a[i] - b[i]; s += d * d }
  return Math.sqrt(s)
}
function haversine(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000, rad = (g: number) => (g * Math.PI) / 180
  const dLat = rad(lat2 - lat1), dLon = rad(lon2 - lon1)
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLon / 2) ** 2
  return Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)))
}

// ---- token assinado (HMAC-SHA256) ----
const encoder = new TextEncoder()
function b64url(bytes: ArrayBuffer | Uint8Array): string {
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)
  let s = ''
  for (const c of b) s += String.fromCharCode(c)
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}
function b64urlToStr(s: string): string {
  s = s.replace(/-/g, '+').replace(/_/g, '/')
  return atob(s)
}
async function hmac(secret: string, msg: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(msg))
  return b64url(sig)
}
async function criarToken(secret: string, payload: object): Promise<string> {
  const body = b64url(encoder.encode(JSON.stringify(payload)))
  const sig = await hmac(secret, body)
  return `${body}.${sig}`
}
async function lerToken(secret: string, token: string): Promise<any | null> {
  const [body, sig] = token.split('.')
  if (!body || !sig) return null
  if ((await hmac(secret, body)) !== sig) return null
  try {
    const p = JSON.parse(b64urlToStr(body))
    if (!p.exp || p.exp < Date.now()) return null
    return p
  } catch { return null }
}

function proximasAcoes(ultimoTipo: string | null, horasDesde: number): string[] {
  if (!ultimoTipo || ultimoTipo === 'saida' || horasDesde > 16) return ['entrada']
  if (ultimoTipo === 'entrada') return ['inicio_intervalo', 'saida']
  if (ultimoTipo === 'inicio_intervalo') return ['fim_intervalo']
  if (ultimoTipo === 'fim_intervalo') return ['saida']
  return ['entrada']
}

async function ultimaMarcacao(admin: any, funcId: string) {
  const { data } = await admin
    .from('ponto_marcacoes')
    .select('tipo, registrado_em')
    .eq('funcionario_id', funcId)
    .order('registrado_em', { ascending: false })
    .limit(1)
    .maybeSingle()
  return data as { tipo: string; registrado_em: string } | null
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ erro: 'Método não permitido' }, 405)

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  const { data: seg } = await admin.from('ponto_secrets').select('valor').eq('chave', 'token_secret').maybeSingle()
  const tokenSecret = seg?.valor ?? ''

  let body: any
  try { body = await req.json() } catch { return json({ erro: 'JSON inválido' }, 400) }
  const acao = body.acao ?? 'identificar'

  const ip = req.headers.get('x-forwarded-for')?.split(',')[0].trim() ?? req.headers.get('x-real-ip') ?? ''

  // =========================================================
  // ETAPA 1 — IDENTIFICAR
  // =========================================================
  if (acao === 'identificar') {
    const { metodo, descritor, matricula, pin } = body
    let funcionario: any = null
    let confianca: number | undefined

    if (metodo === 'facial') {
      if (!Array.isArray(descritor)) return json({ erro: 'Descritor facial ausente' }, 400)
      const { data: funcs } = await admin
        .from('ponto_funcionarios')
        .select('id, nome, face_descriptor')
        .eq('ativo', true)
        .not('face_descriptor', 'is', null)
      let melhor = Infinity
      for (const f of funcs ?? []) {
        const d = distancia(descritor, f.face_descriptor as number[])
        if (d < melhor) { melhor = d; funcionario = f }
      }
      if (!funcionario || melhor > LIMIAR_MATCH) return json({ erro: 'Rosto não reconhecido. Tente novamente ou use o PIN.' }, 404)
      confianca = Math.max(0, Math.min(1, 1 - melhor / LIMIAR_MATCH / 2))
    } else if (metodo === 'pin') {
      if (!matricula || !pin) return json({ erro: 'Matrícula e PIN obrigatórios' }, 400)
      const { data: f } = await admin
        .from('ponto_funcionarios')
        .select('id, nome, pin_hash')
        .eq('matricula', matricula).eq('ativo', true).maybeSingle()
      if (!f || !f.pin_hash || !bcrypt.compareSync(String(pin), f.pin_hash)) return json({ erro: 'Matrícula ou PIN incorretos.' }, 401)
      funcionario = f
    } else return json({ erro: 'Método inválido' }, 400)

    const ult = await ultimaMarcacao(admin, funcionario.id)
    const horasDesde = ult ? (Date.now() - new Date(ult.registrado_em).getTime()) / 3600000 : Infinity
    const proximas = proximasAcoes(ult?.tipo ?? null, horasDesde)

    const token = await criarToken(tokenSecret, {
      id: funcionario.id, metodo, conf: confianca ?? null, exp: Date.now() + TOKEN_TTL_MS,
    })
    const primeiroNome = String(funcionario.nome).split(' ')[0]
    return json({ funcionario: funcionario.nome, primeiro_nome: primeiroNome, proximas, token })
  }

  // =========================================================
  // ETAPA 2 — REGISTRAR
  // =========================================================
  if (acao === 'registrar') {
    const { token, tipo, latitude, longitude } = body
    const p = await lerToken(tokenSecret, token ?? '')
    if (!p) return json({ erro: 'Sessão expirada. Identifique-se novamente.' }, 401)

    const { data: funcionario } = await admin
      .from('ponto_funcionarios').select('id, nome, local_id').eq('id', p.id).maybeSingle()
    if (!funcionario) return json({ erro: 'Funcionário não encontrado' }, 404)

    // revalida a ação escolhida
    const ult = await ultimaMarcacao(admin, funcionario.id)
    const horasDesde = ult ? (Date.now() - new Date(ult.registrado_em).getTime()) / 3600000 : Infinity
    const proximas = proximasAcoes(ult?.tipo ?? null, horasDesde)
    if (!proximas.includes(tipo)) return json({ erro: 'Ação não permitida agora.', proximas }, 409)

    // valida local (GPS ou IP)
    let localValido = false, distanciaM: number | null = null
    if (funcionario.local_id) {
      const { data: local } = await admin.from('ponto_locais')
        .select('latitude, longitude, raio_metros, ips_permitidos').eq('id', funcionario.local_id).single()
      if (local) {
        const ipOk = ip && (local.ips_permitidos ?? []).includes(ip)
        let gpsOk = false
        if (local.latitude != null && local.longitude != null && latitude != null && longitude != null) {
          distanciaM = haversine(latitude, longitude, local.latitude, local.longitude)
          gpsOk = distanciaM <= local.raio_metros
        }
        localValido = Boolean(ipOk || gpsOk)
      }
    }

    const { error } = await admin.from('ponto_marcacoes').insert({
      funcionario_id: funcionario.id, tipo, metodo: p.metodo,
      latitude: latitude ?? null, longitude: longitude ?? null, distancia_m: distanciaM,
      ip: ip || null, confianca: p.conf ?? null, local_valido: localValido,
      local_id: funcionario.local_id ?? null, dispositivo: req.headers.get('user-agent') ?? null,
    })
    if (error) return json({ erro: 'Falha ao gravar a marcação' }, 500)

    return json({
      funcionario: funcionario.nome, tipo, metodo: p.metodo, local_valido: localValido,
      hora: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' }),
    })
  }

  return json({ erro: 'Ação inválida' }, 400)
})
