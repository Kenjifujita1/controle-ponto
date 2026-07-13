import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string

if (!url || !anonKey) {
  // eslint-disable-next-line no-console
  console.warn('Supabase não configurado — defina VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY no .env')
}

export const supabase = createClient(url ?? '', anonKey ?? '')

// URL base das Edge Functions (marcação sem login passa por aqui)
export const functionsUrl = `${url}/functions/v1`

/** Chama uma Edge Function autenticada com a sessão do gestor logado. */
export async function chamarFuncao<T = unknown>(
  nome: string,
  payload: Record<string, unknown>,
): Promise<T> {
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token ?? anonKey
  const res = await fetch(`${functionsUrl}/${nome}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(payload),
  })
  const json = await res.json()
  if (!res.ok) throw new Error(json.erro || 'Falha na operação')
  return json as T
}
