import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { calcularDias, minParaHoras, type MarcacaoBruta } from '../../lib/relatorio'
import type { Funcionario, Local, TipoMarcacao } from '../../types'

type Periodo = 'hoje' | 'semana' | 'mes'
const DIAS: Record<Periodo, number> = { hoje: 1, semana: 7, mes: 30 }

type Status = 'Trabalhando' | 'Em intervalo' | 'Encerrado' | 'Sem registro' | 'Esqueceu saída'

const COR: Record<Status, string> = {
  'Trabalhando': 'text-white font-medium',
  'Em intervalo': 'text-neutral-400',
  'Encerrado': 'text-neutral-500',
  'Sem registro': 'text-neutral-600',
  'Esqueceu saída': 'text-red-400', // vermelho mantido: é um alerta funcional
}

function dataSP(iso: string): string {
  return new Date(iso).toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })
}
function horaSP(iso: string): string {
  return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' })
}
function hojeSP(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })
}

interface LinhaFunc {
  id: string
  nome: string
  status: Status
  ultimaHora: string | null
  minHoje: number
  minPeriodo: number
}

export default function Monitor() {
  const [periodo, setPeriodo] = useState<Periodo>('hoje')
  const [funcs, setFuncs] = useState<Funcionario[]>([])
  const [locais, setLocais] = useState<Local[]>([])
  const [marcs, setMarcs] = useState<(MarcacaoBruta & { registrado_em: string })[]>([])
  const [alertas, setAlertas] = useState<{ id: string; detalhe: string; enviado_em: string }[]>([])
  const [carregando, setCarregando] = useState(true)

  async function carregar(dias: number) {
    setCarregando(true)
    const inicio = new Date()
    inicio.setDate(inicio.getDate() - (dias - 1))
    inicio.setHours(0, 0, 0, 0)
    const [f, l, m, a] = await Promise.all([
      supabase.from('ponto_funcionarios').select('id, nome, matricula, cpf, equipe_id, local_id, jornada_diaria_min, ativo').eq('ativo', true).order('nome'),
      supabase.from('ponto_locais').select('id, nome, latitude, longitude, raio_metros, ips_permitidos, ativo, horas_limite_saida'),
      supabase.from('ponto_marcacoes').select('funcionario_id, tipo, registrado_em').gte('registrado_em', inicio.toISOString()).order('registrado_em'),
      supabase.from('ponto_alertas').select('id, detalhe, enviado_em').order('enviado_em', { ascending: false }).limit(20),
    ])
    setFuncs((f.data as Funcionario[]) ?? [])
    setLocais((l.data as Local[]) ?? [])
    setMarcs((m.data as (MarcacaoBruta & { registrado_em: string })[]) ?? [])
    setAlertas((a.data as { id: string; detalhe: string; enviado_em: string }[]) ?? [])
    setCarregando(false)
  }

  useEffect(() => {
    carregar(DIAS[periodo])
  }, [periodo])

  // marcações agrupadas por funcionário
  const porFunc = useMemo(() => {
    const m: Record<string, (MarcacaoBruta & { registrado_em: string })[]> = {}
    for (const x of marcs) (m[x.funcionario_id] ??= []).push(x)
    return m
  }, [marcs])

  const limitePorLocal = useMemo(() => {
    const m: Record<string, number> = {}
    for (const l of locais) m[l.id] = l.horas_limite_saida ?? 10
    return m
  }, [locais])

  function calcFunc(f: Funcionario): LinhaFunc {
    const eventos = porFunc[f.id] ?? []
    const hoje = hojeSP()
    const doDia = eventos.filter((e) => dataSP(e.registrado_em) === hoje)

    let status: Status = 'Sem registro'
    let ultimaHora: string | null = null
    let ultimaEntrada: number | null = null
    for (const e of doDia) {
      if (e.tipo === 'entrada') ultimaEntrada = new Date(e.registrado_em).getTime()
      else if (e.tipo === 'saida') ultimaEntrada = null
    }
    if (doDia.length) {
      const ult = doDia[doDia.length - 1]
      ultimaHora = horaSP(ult.registrado_em)
      const t = ult.tipo as TipoMarcacao
      if (t === 'entrada' || t === 'fim_intervalo') status = 'Trabalhando'
      else if (t === 'inicio_intervalo') status = 'Em intervalo'
      else if (t === 'saida') status = 'Encerrado'
    }
    // regra do esquecimento (mesma do alerta)
    if (status === 'Trabalhando' && ultimaEntrada != null) {
      const limite = f.local_id ? limitePorLocal[f.local_id] ?? 10 : 10
      if ((Date.now() - ultimaEntrada) / 3600000 >= limite) status = 'Esqueceu saída'
    }

    const minHoje = calcularDias(doDia.map((e) => ({ funcionario_id: f.id, tipo: e.tipo, registrado_em: e.registrado_em })))
      .reduce((s, d) => s + d.minutosTrabalhados, 0)
    const minPeriodo = calcularDias(eventos.map((e) => ({ funcionario_id: f.id, tipo: e.tipo, registrado_em: e.registrado_em })))
      .reduce((s, d) => s + d.minutosTrabalhados, 0)

    return { id: f.id, nome: f.nome, status, ultimaHora, minHoje, minPeriodo }
  }

  // agrupa funcionários por unidade
  const grupos = useMemo(() => {
    const semUnidade: Funcionario[] = []
    const porLocal = new Map<string, Funcionario[]>()
    for (const f of funcs) {
      if (f.local_id) {
        if (!porLocal.has(f.local_id)) porLocal.set(f.local_id, [])
        porLocal.get(f.local_id)!.push(f)
      } else semUnidade.push(f)
    }
    const nomeLocal = (id: string) => locais.find((l) => l.id === id)?.nome ?? 'Unidade'
    const arr = [...porLocal.entries()].map(([id, fs]) => ({ nome: nomeLocal(id), funcionarios: fs }))
    arr.sort((a, b) => a.nome.localeCompare(b.nome))
    if (semUnidade.length) arr.push({ nome: 'Sem unidade', funcionarios: semUnidade })
    return arr
  }, [funcs, locais])

  if (carregando) return <p className="text-neutral-400">Carregando…</p>

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-white">Monitor</h2>
        <div className="flex gap-1 rounded-xl bg-neutral-800 p-1">
          {(['hoje', 'semana', 'mes'] as Periodo[]).map((p) => (
            <button
              key={p}
              onClick={() => setPeriodo(p)}
              className={`rounded-lg px-3 py-1.5 text-sm ${periodo === p ? 'bg-white text-black' : 'text-neutral-300'}`}
            >
              {p === 'hoje' ? 'Hoje' : p === 'semana' ? '7 dias' : '30 dias'}
            </button>
          ))}
        </div>
      </div>

      {alertas.length > 0 && (
        <div className="card mb-4 border-red-500/30 bg-red-500/5">
          <h3 className="mb-2 text-sm font-semibold text-red-300">⚠️ Alertas recentes</h3>
          <ul className="space-y-1 text-sm text-neutral-300">
            {alertas.slice(0, 5).map((a) => (
              <li key={a.id}>
                {a.detalhe} <span className="text-neutral-500">· {horaSP(a.enviado_em)} {dataSP(a.enviado_em).split('-').reverse().join('/')}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="space-y-6">
        {grupos.map((g) => {
          const linhas = g.funcionarios.map(calcFunc)
          const presentes = linhas.filter((l) => l.status === 'Trabalhando' || l.status === 'Em intervalo').length
          const alertasU = linhas.filter((l) => l.status === 'Esqueceu saída').length
          return (
            <div key={g.nome} className="card">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <h3 className="font-semibold text-white">{g.nome}</h3>
                <div className="flex gap-2 text-xs">
                  <span className="rounded-full bg-neutral-800 px-2 py-1 text-white">{presentes} presente(s)</span>
                  <span className="rounded-full bg-neutral-800 px-2 py-1 text-neutral-400">{linhas.length} total</span>
                  {alertasU > 0 && <span className="rounded-full bg-red-600/20 px-2 py-1 text-red-300">{alertasU} alerta(s)</span>}
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-neutral-400">
                      <th className="py-1 pr-3">Funcionário</th>
                      <th className="py-1 pr-3">Status</th>
                      <th className="py-1 pr-3">Última</th>
                      <th className="py-1 pr-3 text-right">Hoje</th>
                      <th className="py-1 text-right">{periodo === 'hoje' ? 'Hoje' : 'Período'}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {linhas.map((l) => (
                      <tr key={l.id} className="border-t border-neutral-700/50">
                        <td className="py-2 pr-3 font-medium text-white">{l.nome}</td>
                        <td className={`py-2 pr-3 ${COR[l.status]}`}>{l.status}</td>
                        <td className="py-2 pr-3 text-neutral-400">{l.ultimaHora ?? '—'}</td>
                        <td className="py-2 pr-3 text-right font-mono">{minParaHoras(l.minHoje)}</td>
                        <td className="py-2 text-right font-mono text-white">{minParaHoras(l.minPeriodo)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
