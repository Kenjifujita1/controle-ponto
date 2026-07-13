import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import type { Equipe, Perfil } from '../../types'

export default function Equipes() {
  const [lista, setLista] = useState<Equipe[]>([])
  const [supervisores, setSupervisores] = useState<Perfil[]>([])
  const [contagem, setContagem] = useState<Record<string, number>>({})
  const [carregando, setCarregando] = useState(true)
  const [form, setForm] = useState<{ nome: string; supervisor_id: string } | null>(null)
  const [editId, setEditId] = useState<string | null>(null)

  async function carregar() {
    const [e, p, f] = await Promise.all([
      supabase.from('ponto_equipes').select('id, nome, supervisor_id').order('nome'),
      supabase.from('ponto_perfis').select('id, nome, papel'),
      supabase.from('ponto_funcionarios').select('equipe_id'),
    ])
    setLista((e.data as Equipe[]) ?? [])
    setSupervisores((p.data as Perfil[]) ?? [])
    const cont: Record<string, number> = {}
    for (const row of (f.data as { equipe_id: string | null }[]) ?? []) {
      if (row.equipe_id) cont[row.equipe_id] = (cont[row.equipe_id] ?? 0) + 1
    }
    setContagem(cont)
    setCarregando(false)
  }
  useEffect(() => {
    carregar()
  }, [])

  async function salvar(e: React.FormEvent) {
    e.preventDefault()
    if (!form) return
    const dados = { nome: form.nome, supervisor_id: form.supervisor_id || null }
    if (editId) await supabase.from('ponto_equipes').update(dados).eq('id', editId)
    else await supabase.from('ponto_equipes').insert(dados)
    setForm(null)
    carregar()
  }

  const nomeSup = (id: string | null) => supervisores.find((s) => s.id === id)?.nome ?? '—'

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-white">Equipes</h2>
        <button className="btn-primary" onClick={() => { setForm({ nome: '', supervisor_id: '' }); setEditId(null) }}>
          + Nova
        </button>
      </div>

      {carregando ? (
        <p className="text-neutral-400">Carregando…</p>
      ) : lista.length === 0 ? (
        <div className="card text-center text-neutral-400">Nenhuma equipe cadastrada.</div>
      ) : (
        <div className="space-y-2">
          {lista.map((eq) => (
            <div key={eq.id} className="card flex items-center justify-between py-3">
              <div>
                <p className="font-medium text-white">{eq.nome}</p>
                <p className="text-sm text-neutral-400">
                  Supervisor: {nomeSup(eq.supervisor_id)} · {contagem[eq.id] ?? 0} pessoa(s)
                </p>
              </div>
              <button
                className="text-sm text-brand hover:underline"
                onClick={() => { setForm({ nome: eq.nome, supervisor_id: eq.supervisor_id ?? '' }); setEditId(eq.id) }}
              >
                Editar
              </button>
            </div>
          ))}
        </div>
      )}

      {form && (
        <div className="fixed inset-0 z-40 flex items-start justify-center bg-black/70 p-4">
          <form onSubmit={salvar} className="card my-8 w-full max-w-md space-y-3">
            <h3 className="text-lg font-semibold text-white">{editId ? 'Editar equipe' : 'Nova equipe'}</h3>
            <div>
              <label className="label">Nome *</label>
              <input className="input" value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} required />
            </div>
            <div>
              <label className="label">Supervisor</label>
              <select className="input" value={form.supervisor_id} onChange={(e) => setForm({ ...form, supervisor_id: e.target.value })}>
                <option value="">— sem supervisor —</option>
                {supervisores.map((s) => (
                  <option key={s.id} value={s.id}>{s.nome} ({s.papel})</option>
                ))}
              </select>
              <p className="mt-1 text-xs text-neutral-500">
                Supervisores são usuários com login. Novos logins de supervisor são criados no painel do Supabase (Auth) — depois aparecem aqui.
              </p>
            </div>
            <div className="flex gap-2 pt-1">
              <button type="button" className="btn-ghost flex-1" onClick={() => setForm(null)}>Cancelar</button>
              <button className="btn-primary flex-1">Salvar</button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}
