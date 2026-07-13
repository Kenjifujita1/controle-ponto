import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../store/auth'
import type { Equipe, Funcionario, Local } from '../../types'
import CapturaFacial from '../../components/CapturaFacial'

interface Status {
  id: string
  tem_face: boolean
  tem_pin: boolean
}

const vazio = {
  nome: '',
  matricula: '',
  cpf: '',
  equipe_id: '',
  local_id: '',
  jornada_horas: 8,
  pin: '',
  consentimento: false,
}

function traduzErro(error: { code?: string; message?: string }): Error {
  const m = error.message ?? ''
  if (error.code === '23505' || m.includes('duplicate key')) {
    if (m.includes('matricula')) return new Error('Já existe um funcionário com essa matrícula. Use outra.')
    return new Error('Já existe um registro com esses dados.')
  }
  return new Error(m || 'Erro ao salvar')
}

export default function Funcionarios() {
  const meuNome = useAuth((s) => s.perfil?.nome)
  const [lista, setLista] = useState<Funcionario[]>([])
  const [status, setStatus] = useState<Record<string, Status>>({})
  const [equipes, setEquipes] = useState<Equipe[]>([])
  const [locais, setLocais] = useState<Local[]>([])
  const [carregando, setCarregando] = useState(true)
  const [form, setForm] = useState<typeof vazio | null>(null)
  const [editId, setEditId] = useState<string | null>(null)
  const [descritor, setDescritor] = useState<number[] | null>(null)
  const [capturando, setCapturando] = useState(false)
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')

  async function carregar() {
    const [f, s, e, l] = await Promise.all([
      supabase.from('ponto_funcionarios').select('id, nome, matricula, cpf, equipe_id, local_id, jornada_diaria_min, ativo').order('nome'),
      supabase.from('ponto_funcionarios_status').select('id, tem_face, tem_pin'),
      supabase.from('ponto_equipes').select('id, nome, supervisor_id').order('nome'),
      supabase.from('ponto_locais').select('id, nome, latitude, longitude, raio_metros, ips_permitidos, ativo').order('nome'),
    ])
    setLista((f.data as Funcionario[]) ?? [])
    const map: Record<string, Status> = {}
    for (const st of (s.data as Status[]) ?? []) map[st.id] = st
    setStatus(map)
    setEquipes((e.data as Equipe[]) ?? [])
    setLocais((l.data as Local[]) ?? [])
    setCarregando(false)
  }

  useEffect(() => {
    carregar()
  }, [])

  function novo() {
    setForm({ ...vazio })
    setEditId(null)
    setDescritor(null)
    setErro('')
  }

  function editar(f: Funcionario) {
    setForm({
      nome: f.nome,
      matricula: f.matricula ?? '',
      cpf: f.cpf ?? '',
      equipe_id: f.equipe_id ?? '',
      local_id: f.local_id ?? '',
      jornada_horas: Math.round(f.jornada_diaria_min / 60),
      pin: '',
      consentimento: !!status[f.id]?.tem_face, // já consentiu se tem biometria
    })
    setEditId(f.id)
    setDescritor(null)
    setErro('')
  }

  async function salvar(e: React.FormEvent) {
    e.preventDefault()
    if (!form || salvando) return
    setSalvando(true)
    setErro('')
    try {
      const dados: Record<string, unknown> = {
        nome: form.nome,
        matricula: form.matricula || null,
        cpf: form.cpf || null,
        equipe_id: form.equipe_id || null,
        local_id: form.local_id || null,
        jornada_diaria_min: form.jornada_horas * 60,
      }
      if (descritor) {
        dados.face_descriptor = descritor
        dados.consentimento_em = new Date().toISOString()
        dados.consentimento_por = meuNome ?? 'gestor'
      }

      let funcId = editId
      if (editId) {
        const { error } = await supabase.from('ponto_funcionarios').update(dados).eq('id', editId)
        if (error) throw traduzErro(error)
      } else {
        const { data, error } = await supabase.from('ponto_funcionarios').insert(dados).select('id').single()
        if (error) throw traduzErro(error)
        funcId = (data as { id: string }).id
        // já criou: entra em modo edição para que um novo clique NÃO crie duplicado
        setEditId(funcId)
      }

      // PIN não é crítico: se falhar, o funcionário já está salvo — só avisa.
      let avisoPin = ''
      if (form.pin && funcId) {
        const { error } = await supabase.rpc('ponto_definir_pin', { func_id: funcId, novo_pin: form.pin })
        if (error) avisoPin = ' (mas não consegui definir o PIN — edite e tente de novo)'
      }

      setForm(null)
      await carregar()
      if (avisoPin) alert('Funcionário salvo' + avisoPin)
    } catch (err) {
      setErro((err as Error).message || 'Erro ao salvar')
    } finally {
      setSalvando(false)
    }
  }

  async function alternarAtivo(f: Funcionario) {
    await supabase.from('ponto_funcionarios').update({ ativo: !f.ativo }).eq('id', f.id)
    carregar()
  }

  async function removerBiometria(id: string) {
    if (!confirm('Remover a biometria facial deste funcionário? Ele voltará a marcar ponto só por PIN.')) return
    await supabase
      .from('ponto_funcionarios')
      .update({ face_descriptor: null, consentimento_em: null, consentimento_por: null })
      .eq('id', id)
    setForm(null)
    carregar()
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-white">Funcionários ({lista.length})</h2>
        <button className="btn-primary" onClick={novo}>
          + Novo
        </button>
      </div>

      {carregando ? (
        <p className="text-neutral-400">Carregando…</p>
      ) : lista.length === 0 ? (
        <div className="card text-center text-neutral-400">Nenhum funcionário cadastrado ainda.</div>
      ) : (
        <div className="space-y-2">
          {lista.map((f) => (
            <div key={f.id} className="card flex items-center justify-between py-3">
              <div>
                <p className="font-medium text-white">{f.nome}</p>
                <p className="text-sm text-neutral-400">
                  Matrícula: {f.matricula ?? '—'}
                  {status[f.id]?.tem_face && <span className="ml-2 text-neutral-300">🙂 facial</span>}
                  {status[f.id]?.tem_pin && <span className="ml-2 text-neutral-300">🔢 PIN</span>}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button className="text-sm text-brand hover:underline" onClick={() => editar(f)}>
                  Editar
                </button>
                <button
                  className={`text-sm ${f.ativo ? 'text-neutral-400' : 'text-white'} hover:underline`}
                  onClick={() => alternarAtivo(f)}
                >
                  {f.ativo ? 'Desativar' : 'Ativar'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {form && (
        <div className="fixed inset-0 z-40 flex items-start justify-center overflow-y-auto bg-black/70 p-4">
          <form onSubmit={salvar} className="card my-8 w-full max-w-md space-y-3">
            <h3 className="text-lg font-semibold text-white">
              {editId ? 'Editar funcionário' : 'Novo funcionário'}
            </h3>

            <div>
              <label className="label">Nome *</label>
              <input className="input" value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} required />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">Matrícula</label>
                <input className="input" value={form.matricula} onChange={(e) => setForm({ ...form, matricula: e.target.value })} />
              </div>
              <div>
                <label className="label">CPF</label>
                <input className="input" value={form.cpf} onChange={(e) => setForm({ ...form, cpf: e.target.value })} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">Equipe</label>
                <select className="input" value={form.equipe_id} onChange={(e) => setForm({ ...form, equipe_id: e.target.value })}>
                  <option value="">—</option>
                  {equipes.map((eq) => (
                    <option key={eq.id} value={eq.id}>{eq.nome}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label">Local</label>
                <select className="input" value={form.local_id} onChange={(e) => setForm({ ...form, local_id: e.target.value })}>
                  <option value="">—</option>
                  {locais.map((lo) => (
                    <option key={lo.id} value={lo.id}>{lo.nome}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">Jornada (h/dia)</label>
                <input
                  className="input"
                  type="number"
                  min={1}
                  max={12}
                  value={form.jornada_horas}
                  onChange={(e) => setForm({ ...form, jornada_horas: Number(e.target.value) })}
                />
              </div>
              <div>
                <label className="label">PIN {editId ? '(deixe vazio p/ manter)' : '(backup)'}</label>
                <input className="input" inputMode="numeric" value={form.pin} onChange={(e) => setForm({ ...form, pin: e.target.value })} />
              </div>
            </div>

            <div className="space-y-2 rounded-xl bg-neutral-900 p-3">
              <label className="flex items-start gap-2 text-xs text-neutral-300">
                <input
                  type="checkbox"
                  className="mt-0.5"
                  checked={form.consentimento}
                  onChange={(e) => setForm({ ...form, consentimento: e.target.checked })}
                />
                <span>
                  O funcionário <strong>autoriza o uso da sua biometria facial</strong> para registro de ponto
                  (LGPD). A imagem não é armazenada — apenas um código matemático do rosto.
                </span>
              </label>
              <div className="flex items-center justify-between">
                <span className="text-sm text-neutral-300">
                  Rosto: {descritor ? <span className="text-white">capturado ✓</span> : editId && status[editId]?.tem_face ? 'já cadastrado' : 'não cadastrado'}
                </span>
                <button
                  type="button"
                  className="btn-ghost py-2"
                  disabled={!form.consentimento}
                  title={!form.consentimento ? 'Marque o consentimento primeiro' : ''}
                  onClick={() => setCapturando(true)}
                >
                  {descritor ? 'Recapturar' : 'Capturar rosto'}
                </button>
              </div>
              {editId && status[editId]?.tem_face && (
                <button
                  type="button"
                  className="text-xs text-red-400 hover:underline"
                  onClick={() => removerBiometria(editId)}
                >
                  Remover biometria deste funcionário
                </button>
              )}
            </div>

            {erro && <p className="text-sm text-red-400">{erro}</p>}

            <div className="flex gap-2 pt-1">
              <button type="button" className="btn-ghost flex-1" onClick={() => setForm(null)}>
                Cancelar
              </button>
              <button className="btn-primary flex-1" disabled={salvando}>
                {salvando ? 'Salvando…' : 'Salvar'}
              </button>
            </div>
          </form>
        </div>
      )}

      {capturando && (
        <CapturaFacial
          onCapturar={(d) => {
            setDescritor(d)
            setCapturando(false)
          }}
          onCancelar={() => setCapturando(false)}
        />
      )}
    </div>
  )
}
