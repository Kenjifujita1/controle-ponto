import { useEffect, useState } from 'react'
import { chamarFuncao, supabase } from '../../lib/supabase'

export default function Configuracoes() {
  const [emails, setEmails] = useState('')
  const [remetenteNome, setRemetenteNome] = useState('Grupo BF')
  const [remetenteEmail, setRemetenteEmail] = useState('onboarding@resend.dev')
  const [resendOk, setResendOk] = useState<boolean | null>(null)
  const [msg, setMsg] = useState('')
  const [carregando, setCarregando] = useState(true)

  useEffect(() => {
    ;(async () => {
      const { data } = await supabase.from('ponto_config').select('chave, valor')
      const cfg: Record<string, unknown> = {}
      for (const c of (data as { chave: string; valor: unknown }[]) ?? []) cfg[c.chave] = c.valor
      if (Array.isArray(cfg['emails_admin_alerta'])) setEmails((cfg['emails_admin_alerta'] as string[]).join(', '))
      if (cfg['remetente_nome']) setRemetenteNome(cfg['remetente_nome'] as string)
      if (cfg['remetente_email']) setRemetenteEmail(cfg['remetente_email'] as string)
      const { data: r } = await supabase.rpc('ponto_resend_configurado')
      setResendOk(Boolean(r))
      setCarregando(false)
    })()
  }, [])

  async function salvar() {
    setMsg('')
    const lista = emails.split(/[,\n;]/).map((s) => s.trim()).filter(Boolean)
    const { error } = await supabase.from('ponto_config').upsert([
      { chave: 'emails_admin_alerta', valor: lista },
      { chave: 'remetente_nome', valor: remetenteNome },
      { chave: 'remetente_email', valor: remetenteEmail },
    ])
    setMsg(error ? `Erro: ${error.message}` : '✓ Configurações salvas.')
  }

  async function testar() {
    setMsg('Enviando e-mail de teste…')
    try {
      const lista = emails.split(/[,\n;]/).map((s) => s.trim()).filter(Boolean)
      const r = await chamarFuncao<{ ok?: boolean; para?: string }>('verificar-ponto', { acao: 'testar', para: lista[0] })
      setMsg(`✓ E-mail de teste enviado para ${r.para}.`)
    } catch (e) {
      setMsg(`Falha: ${(e as Error).message}`)
    }
  }

  async function verificarAgora() {
    setMsg('Verificando esquecimentos…')
    try {
      const r = await chamarFuncao<{ novos_alertas: number; emails_enviados: number }>('verificar-ponto', { acao: 'verificar' })
      setMsg(`✓ Verificação concluída: ${r.novos_alertas} novo(s) alerta(s), ${r.emails_enviados} e-mail(s) enviado(s).`)
    } catch (e) {
      setMsg(`Falha: ${(e as Error).message}`)
    }
  }

  if (carregando) return <p className="text-neutral-400">Carregando…</p>

  return (
    <div className="max-w-lg">
      <h2 className="mb-4 text-lg font-semibold text-white">Configurações de alertas</h2>

      <div className={`card mb-4 ${resendOk ? 'border-white/30' : 'border-neutral-700'}`}>
        <p className="text-sm">
          Envio de e-mail (Resend):{' '}
          {resendOk ? (
            <span className="text-white font-medium">configurado ✓</span>
          ) : (
            <span className="text-neutral-400 font-medium">não configurado</span>
          )}
        </p>
        {!resendOk && (
          <p className="mt-2 text-xs text-neutral-400">
            Os esquecimentos já são registrados no Monitor. Para enviar e-mails, crie uma conta grátis em
            resend.com e envie a API key para configurarmos. Sem isso, o envio fica desativado.
          </p>
        )}
      </div>

      <div className="card space-y-3">
        <div>
          <label className="label">E-mails que recebem os alertas (você)</label>
          <textarea
            className="input min-h-[70px]"
            value={emails}
            onChange={(e) => setEmails(e.target.value)}
            placeholder="voce@empresa.com, outro@empresa.com"
          />
          <p className="mt-1 text-xs text-neutral-500">Separe por vírgula. Cada unidade também pode ter um responsável próprio (em Unidades).</p>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Nome do remetente</label>
            <input className="input" value={remetenteNome} onChange={(e) => setRemetenteNome(e.target.value)} />
          </div>
          <div>
            <label className="label">E-mail do remetente</label>
            <input className="input" value={remetenteEmail} onChange={(e) => setRemetenteEmail(e.target.value)} />
          </div>
        </div>

        {msg && <p className="text-sm text-neutral-300">{msg}</p>}

        <div className="flex flex-wrap gap-2">
          <button className="btn-primary" onClick={salvar}>Salvar</button>
          <button className="btn-ghost" onClick={testar} disabled={!resendOk}>Enviar e-mail de teste</button>
          <button className="btn-ghost" onClick={verificarAgora}>Verificar agora</button>
        </div>
      </div>
    </div>
  )
}
