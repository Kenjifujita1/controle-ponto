import { useEffect, useState } from 'react'
import { chamarFuncao, supabase } from '../../lib/supabase'
import { useAuth } from '../../store/auth'
import type { Papel, Perfil } from '../../types'

export default function Gestores() {
  const meuId = useAuth((s) => s.perfil?.id)
  const [lista, setLista] = useState<Perfil[]>([])
  const [carregando, setCarregando] = useState(true)
  const [criar, setCriar] = useState(false)
  const [resetId, setResetId] = useState<string | null>(null)
  const [msg, setMsg] = useState('')

  async function carregar() {
    const { data } = await supabase.from('ponto_perfis').select('id, nome, papel').order('nome')
    setLista((data as Perfil[]) ?? [])
    setCarregando(false)
  }
  useEffect(() => {
    carregar()
  }, [])

  async function remover(p: Perfil) {
    if (!confirm(`Remover o acesso de ${p.nome}? Esta ação apaga o login dele.`)) return
    try {
      await chamarFuncao('gestores', { acao: 'remover', id: p.id })
      setMsg(`Acesso de ${p.nome} removido.`)
      carregar()
    } catch (e) {
      setMsg((e as Error).message)
    }
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-white">Gestores (admin / supervisores)</h2>
        <button className="btn-primary" onClick={() => { setCriar(true); setMsg('') }}>+ Novo</button>
      </div>

      {msg && <p className="mb-3 text-sm text-white">{msg}</p>}

      {carregando ? (
        <p className="text-neutral-400">Carregando…</p>
      ) : (
        <div className="space-y-2">
          {lista.map((p) => (
            <div key={p.id} className="card flex items-center justify-between py-3">
              <div>
                <p className="font-medium text-white">
                  {p.nome} {p.id === meuId && <span className="text-xs text-neutral-500">(você)</span>}
                </p>
                <p className="text-sm text-neutral-400">{p.papel === 'admin' ? 'Administrador' : 'Supervisor'}</p>
              </div>
              <div className="flex items-center gap-3">
                <button className="text-sm text-brand hover:underline" onClick={() => { setResetId(p.id); setMsg('') }}>
                  Resetar senha
                </button>
                {p.id !== meuId && (
                  <button className="text-sm text-red-400 hover:underline" onClick={() => remover(p)}>
                    Remover
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {criar && (
        <ModalCriar
          onFechar={() => setCriar(false)}
          onCriado={(nome) => { setCriar(false); setMsg(`Gestor ${nome} criado.`); carregar() }}
        />
      )}
      {resetId && (
        <ModalReset
          onFechar={() => setResetId(null)}
          onOk={() => { setResetId(null); setMsg('Senha redefinida.') }}
          id={resetId}
        />
      )}
    </div>
  )
}

function ModalCriar({ onFechar, onCriado }: { onFechar: () => void; onCriado: (nome: string) => void }) {
  const [nome, setNome] = useState('')
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [papel, setPapel] = useState<Papel>('supervisor')
  const [erro, setErro] = useState('')
  const [salvando, setSalvando] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setSalvando(true)
    setErro('')
    try {
      await chamarFuncao('gestores', { acao: 'criar', nome, email, senha, papel })
      onCriado(nome)
    } catch (err) {
      setErro((err as Error).message)
      setSalvando(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <form onSubmit={submit} className="card w-full max-w-sm space-y-3">
        <h3 className="text-lg font-semibold text-white">Novo gestor</h3>
        <div>
          <label className="label">Nome *</label>
          <input className="input" value={nome} onChange={(e) => setNome(e.target.value)} required />
        </div>
        <div>
          <label className="label">E-mail *</label>
          <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </div>
        <div>
          <label className="label">Senha inicial *</label>
          <input className="input" value={senha} onChange={(e) => setSenha(e.target.value)} required />
        </div>
        <div>
          <label className="label">Papel</label>
          <select className="input" value={papel} onChange={(e) => setPapel(e.target.value as Papel)}>
            <option value="supervisor">Supervisor (vê só a equipe dele)</option>
            <option value="admin">Administrador (vê tudo)</option>
          </select>
        </div>
        {erro && <p className="text-sm text-red-400">{erro}</p>}
        <div className="flex gap-2">
          <button type="button" className="btn-ghost flex-1" onClick={onFechar}>Cancelar</button>
          <button className="btn-primary flex-1" disabled={salvando}>{salvando ? 'Criando…' : 'Criar'}</button>
        </div>
      </form>
    </div>
  )
}

function ModalReset({ id, onFechar, onOk }: { id: string; onFechar: () => void; onOk: () => void }) {
  const [senha, setSenha] = useState('')
  const [erro, setErro] = useState('')
  const [salvando, setSalvando] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setSalvando(true)
    setErro('')
    try {
      await chamarFuncao('gestores', { acao: 'resetar_senha', id, senha })
      onOk()
    } catch (err) {
      setErro((err as Error).message)
      setSalvando(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <form onSubmit={submit} className="card w-full max-w-sm space-y-3">
        <h3 className="text-lg font-semibold text-white">Resetar senha</h3>
        <div>
          <label className="label">Nova senha</label>
          <input className="input" value={senha} onChange={(e) => setSenha(e.target.value)} required />
        </div>
        {erro && <p className="text-sm text-red-400">{erro}</p>}
        <div className="flex gap-2">
          <button type="button" className="btn-ghost flex-1" onClick={onFechar}>Cancelar</button>
          <button className="btn-primary flex-1" disabled={salvando}>{salvando ? 'Salvando…' : 'Salvar'}</button>
        </div>
      </form>
    </div>
  )
}
