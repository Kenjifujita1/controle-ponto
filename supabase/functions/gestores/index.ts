// Edge Function: gestores
// Cria/reseta/remove usuários gestores (admin/supervisor) via Admin API do
// Supabase. Só um admin autenticado pode chamar. Faz o cadastro do jeito certo
// (Admin API), evitando o bug de colunas NULL do GoTrue no insert manual.
import { createClient } from 'jsr:@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ erro: 'Método não permitido' }, 405)

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  // ---- Autenticação: quem está chamando? ----
  const token = req.headers.get('Authorization')?.replace('Bearer ', '') ?? ''
  const { data: userData } = await admin.auth.getUser(token)
  const uid = userData.user?.id
  if (!uid) return json({ erro: 'Não autenticado' }, 401)

  // ---- Autorização: precisa ser admin ----
  const { data: perfil } = await admin
    .from('ponto_perfis')
    .select('papel')
    .eq('id', uid)
    .maybeSingle()
  if (perfil?.papel !== 'admin') return json({ erro: 'Apenas administradores' }, 403)

  let body: any
  try {
    body = await req.json()
  } catch {
    return json({ erro: 'JSON inválido' }, 400)
  }
  const { acao } = body

  // ---- Criar gestor ----
  if (acao === 'criar') {
    const { email, senha, nome, papel } = body
    if (!email || !senha || !nome) return json({ erro: 'Dados incompletos' }, 400)
    if (String(senha).length < 6) return json({ erro: 'Senha deve ter ao menos 6 caracteres' }, 400)
    if (!['admin', 'supervisor'].includes(papel)) return json({ erro: 'Papel inválido' }, 400)

    const { data: novo, error: e1 } = await admin.auth.admin.createUser({
      email,
      password: senha,
      email_confirm: true,
    })
    if (e1 || !novo.user) return json({ erro: e1?.message || 'Falha ao criar usuário' }, 400)

    const { error: e2 } = await admin
      .from('ponto_perfis')
      .insert({ id: novo.user.id, nome, papel })
    if (e2) {
      // desfaz a criação do auth para não deixar usuário órfão
      await admin.auth.admin.deleteUser(novo.user.id)
      return json({ erro: 'Falha ao criar perfil' }, 500)
    }
    return json({ ok: true, id: novo.user.id })
  }

  // ---- Resetar senha ----
  if (acao === 'resetar_senha') {
    const { id, senha } = body
    if (!id || !senha) return json({ erro: 'Dados incompletos' }, 400)
    if (String(senha).length < 6) return json({ erro: 'Senha deve ter ao menos 6 caracteres' }, 400)
    const { error } = await admin.auth.admin.updateUserById(id, { password: senha })
    if (error) return json({ erro: error.message }, 400)
    return json({ ok: true })
  }

  // ---- Remover gestor ----
  if (acao === 'remover') {
    const { id } = body
    if (!id) return json({ erro: 'ID obrigatório' }, 400)
    if (id === uid) return json({ erro: 'Você não pode remover a si mesmo' }, 400)
    await admin.from('ponto_perfis').delete().eq('id', id)
    const { error } = await admin.auth.admin.deleteUser(id)
    if (error) return json({ erro: error.message }, 400)
    return json({ ok: true })
  }

  return json({ erro: 'Ação inválida' }, 400)
})
