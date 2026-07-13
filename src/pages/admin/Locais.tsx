import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { obterPosicao } from '../../lib/geo'
import type { Local } from '../../types'

const vazio = {
  nome: '',
  latitude: '',
  longitude: '',
  raio_metros: 150,
  ips: '',
  email_alertas: '',
  telefone_alertas: '',
  horas_limite_saida: 10,
}

export default function Locais() {
  const [lista, setLista] = useState<Local[]>([])
  const [carregando, setCarregando] = useState(true)
  const [form, setForm] = useState<typeof vazio | null>(null)
  const [editId, setEditId] = useState<string | null>(null)
  const [msg, setMsg] = useState('')

  async function carregar() {
    const { data } = await supabase
      .from('ponto_locais')
      .select('id, nome, latitude, longitude, raio_metros, ips_permitidos, ativo, email_alertas, telefone_alertas, horas_limite_saida')
      .order('nome')
    setLista((data as Local[]) ?? [])
    setCarregando(false)
  }
  useEffect(() => {
    carregar()
  }, [])

  function novo() {
    setForm({ ...vazio })
    setEditId(null)
    setMsg('')
  }
  function editar(l: Local) {
    setForm({
      nome: l.nome,
      latitude: l.latitude?.toString() ?? '',
      longitude: l.longitude?.toString() ?? '',
      raio_metros: l.raio_metros,
      ips: (l.ips_permitidos ?? []).join(', '),
      email_alertas: l.email_alertas ?? '',
      telefone_alertas: l.telefone_alertas ?? '',
      horas_limite_saida: l.horas_limite_saida ?? 10,
    })
    setEditId(l.id)
    setMsg('')
  }

  async function usarLocalizacao() {
    if (!form) return
    setMsg('Obtendo localização…')
    try {
      const p = await obterPosicao()
      setForm({ ...form, latitude: p.latitude.toFixed(6), longitude: p.longitude.toFixed(6) })
      setMsg(`Localização capturada (precisão ~${Math.round(p.precisao)}m)`)
    } catch (e) {
      setMsg((e as Error).message)
    }
  }

  async function detectarIp() {
    if (!form) return
    setMsg('Detectando IP público…')
    try {
      const r = await fetch('https://api.ipify.org?format=json')
      const { ip } = await r.json()
      const atuais = form.ips.split(',').map((s) => s.trim()).filter(Boolean)
      if (!atuais.includes(ip)) atuais.push(ip)
      setForm({ ...form, ips: atuais.join(', ') })
      setMsg(`IP do Wi-Fi atual: ${ip}`)
    } catch {
      setMsg('Não foi possível detectar o IP.')
    }
  }

  async function salvar(e: React.FormEvent) {
    e.preventDefault()
    if (!form) return
    const dados = {
      nome: form.nome,
      latitude: form.latitude ? Number(form.latitude) : null,
      longitude: form.longitude ? Number(form.longitude) : null,
      raio_metros: form.raio_metros,
      ips_permitidos: form.ips.split(',').map((s) => s.trim()).filter(Boolean),
      email_alertas: form.email_alertas || null,
      telefone_alertas: form.telefone_alertas || null,
      horas_limite_saida: form.horas_limite_saida,
    }
    if (editId) await supabase.from('ponto_locais').update(dados).eq('id', editId)
    else await supabase.from('ponto_locais').insert(dados)
    setForm(null)
    carregar()
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-white">Unidades</h2>
        <button className="btn-primary" onClick={novo}>+ Nova</button>
      </div>

      <p className="mb-4 text-sm text-neutral-400">
        Cada unidade tem seu GPS/Wi-Fi (valida a marcação) e um responsável que recebe os alertas de esquecimento.
        Uma marcação conta como “no local” se estiver dentro do raio de GPS <strong>ou</strong> num IP de Wi-Fi cadastrado.
      </p>

      {carregando ? (
        <p className="text-neutral-400">Carregando…</p>
      ) : lista.length === 0 ? (
        <div className="card text-center text-neutral-400">Nenhuma unidade cadastrada.</div>
      ) : (
        <div className="space-y-2">
          {lista.map((l) => (
            <div key={l.id} className="card flex items-center justify-between py-3">
              <div>
                <p className="font-medium text-white">{l.nome}</p>
                <p className="text-sm text-neutral-400">
                  {l.latitude ? `GPS ✓ · raio ${l.raio_metros}m` : 'sem GPS'}
                  {l.ips_permitidos?.length ? ` · ${l.ips_permitidos.length} IP(s)` : ''}
                  {` · avisa após ${l.horas_limite_saida ?? 10}h`}
                  {l.email_alertas ? ` · 📧 ${l.email_alertas}` : ' · sem responsável'}
                </p>
              </div>
              <button className="text-sm text-brand hover:underline" onClick={() => editar(l)}>Editar</button>
            </div>
          ))}
        </div>
      )}

      {form && (
        <div className="fixed inset-0 z-40 flex items-start justify-center overflow-y-auto bg-black/70 p-4">
          <form onSubmit={salvar} className="card my-8 w-full max-w-md space-y-3">
            <h3 className="text-lg font-semibold text-white">{editId ? 'Editar unidade' : 'Nova unidade'}</h3>
            <div>
              <label className="label">Nome *</label>
              <input className="input" value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} required />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">Latitude</label>
                <input className="input" value={form.latitude} onChange={(e) => setForm({ ...form, latitude: e.target.value })} />
              </div>
              <div>
                <label className="label">Longitude</label>
                <input className="input" value={form.longitude} onChange={(e) => setForm({ ...form, longitude: e.target.value })} />
              </div>
            </div>
            <button type="button" className="btn-ghost w-full" onClick={usarLocalizacao}>
              📍 Usar minha localização atual
            </button>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">Raio (metros)</label>
                <input className="input" type="number" min={20} value={form.raio_metros}
                  onChange={(e) => setForm({ ...form, raio_metros: Number(e.target.value) })} />
              </div>
              <div>
                <label className="label">Avisar após (horas)</label>
                <input className="input" type="number" min={1} step={0.5} value={form.horas_limite_saida}
                  onChange={(e) => setForm({ ...form, horas_limite_saida: Number(e.target.value) })} />
              </div>
            </div>
            <div>
              <label className="label">IPs do Wi-Fi (separados por vírgula)</label>
              <input className="input" value={form.ips} onChange={(e) => setForm({ ...form, ips: e.target.value })} placeholder="ex.: 200.145.x.x" />
            </div>
            <button type="button" className="btn-ghost w-full" onClick={detectarIp}>
              📶 Adicionar o IP do Wi-Fi atual
            </button>
            <div>
              <label className="label">E-mail do responsável (recebe alertas)</label>
              <input className="input" type="email" value={form.email_alertas}
                onChange={(e) => setForm({ ...form, email_alertas: e.target.value })} placeholder="responsavel@empresa.com" />
            </div>
            <div>
              <label className="label">WhatsApp do responsável (futuro)</label>
              <input className="input" value={form.telefone_alertas}
                onChange={(e) => setForm({ ...form, telefone_alertas: e.target.value })} placeholder="+55 44 9....." />
            </div>

            {msg && <p className="text-sm text-neutral-300">{msg}</p>}

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
