import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { calcularDias, minParaHoras, type MarcacaoBruta } from '../../lib/relatorio'
import { TIPO_LABEL, type Funcionario } from '../../types'

function hojeISO(offsetDias = 0): string {
  const d = new Date()
  d.setDate(d.getDate() + offsetDias)
  return d.toLocaleDateString('en-CA') // YYYY-MM-DD
}

export default function Relatorios() {
  const [funcionarios, setFuncionarios] = useState<Funcionario[]>([])
  const [funcId, setFuncId] = useState('')
  const [inicio, setInicio] = useState(hojeISO(-30))
  const [fim, setFim] = useState(hojeISO(0))
  const [marcacoes, setMarcacoes] = useState<MarcacaoBruta[]>([])
  const [carregando, setCarregando] = useState(false)
  const [buscou, setBuscou] = useState(false)

  useEffect(() => {
    supabase
      .from('ponto_funcionarios')
      .select('id, nome, matricula, cpf, equipe_id, local_id, jornada_diaria_min, ativo')
      .order('nome')
      .then(({ data }) => setFuncionarios((data as Funcionario[]) ?? []))
  }, [])

  async function buscar() {
    setCarregando(true)
    let q = supabase
      .from('ponto_marcacoes')
      .select('funcionario_id, tipo, registrado_em')
      .gte('registrado_em', `${inicio}T00:00:00`)
      .lte('registrado_em', `${fim}T23:59:59`)
      .order('registrado_em')
    if (funcId) q = q.eq('funcionario_id', funcId)
    const { data } = await q
    setMarcacoes((data as MarcacaoBruta[]) ?? [])
    setBuscou(true)
    setCarregando(false)
  }

  const nomePorId = useMemo(() => {
    const m: Record<string, string> = {}
    for (const f of funcionarios) m[f.id] = f.nome
    return m
  }, [funcionarios])

  // Agrupa por funcionário → dias
  const relatorio = useMemo(() => {
    const porFunc = new Map<string, MarcacaoBruta[]>()
    for (const m of marcacoes) {
      if (!porFunc.has(m.funcionario_id)) porFunc.set(m.funcionario_id, [])
      porFunc.get(m.funcionario_id)!.push(m)
    }
    return [...porFunc.entries()].map(([id, ms]) => ({
      id,
      nome: nomePorId[id] ?? id,
      dias: calcularDias(ms),
    }))
  }, [marcacoes, nomePorId])

  async function exportarExcel() {
    const XLSX = await import('xlsx') // carregado só ao exportar
    const linhas: Record<string, string | number>[] = []
    for (const f of relatorio) {
      for (const d of f.dias) {
        linhas.push({
          Funcionário: f.nome,
          Data: d.data.split('-').reverse().join('/'),
          Marcações: d.marcacoes.map((m) => `${TIPO_LABEL[m.tipo]} ${m.hora}`).join(' | '),
          'Horas trabalhadas': minParaHoras(d.minutosTrabalhados),
          Minutos: d.minutosTrabalhados,
        })
      }
    }
    const ws = XLSX.utils.json_to_sheet(linhas)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Espelho de ponto')
    XLSX.writeFile(wb, `espelho-ponto_${inicio}_a_${fim}.xlsx`)
  }

  return (
    <div>
      <h2 className="mb-4 text-lg font-semibold text-white">Relatórios · Espelho de ponto</h2>

      <div className="card mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <div className="col-span-2 md:col-span-1">
          <label className="label">Funcionário</label>
          <select className="input" value={funcId} onChange={(e) => setFuncId(e.target.value)}>
            <option value="">Todos</option>
            {funcionarios.map((f) => (
              <option key={f.id} value={f.id}>{f.nome}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">De</label>
          <input className="input" type="date" value={inicio} onChange={(e) => setInicio(e.target.value)} />
        </div>
        <div>
          <label className="label">Até</label>
          <input className="input" type="date" value={fim} onChange={(e) => setFim(e.target.value)} />
        </div>
        <div className="flex items-end">
          <button className="btn-primary w-full" onClick={buscar} disabled={carregando}>
            {carregando ? 'Buscando…' : 'Buscar'}
          </button>
        </div>
      </div>

      {buscou && (
        <div className="mb-4 flex gap-2 print:hidden">
          <button className="btn-ghost" onClick={exportarExcel} disabled={!relatorio.length}>
            ⬇ Exportar Excel
          </button>
          <button className="btn-ghost" onClick={() => window.print()} disabled={!relatorio.length}>
            🖨 Imprimir / PDF
          </button>
        </div>
      )}

      {buscou && relatorio.length === 0 && (
        <div className="card text-center text-neutral-400">Nenhuma marcação no período.</div>
      )}

      <div className="space-y-6">
        {relatorio.map((f) => {
          const total = f.dias.reduce((s, d) => s + d.minutosTrabalhados, 0)
          return (
            <div key={f.id} className="card">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="font-semibold text-white">{f.nome}</h3>
                <span className="text-sm text-brand">Total: {minParaHoras(total)}</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-neutral-400">
                      <th className="py-1 pr-3">Data</th>
                      <th className="py-1 pr-3">Marcações</th>
                      <th className="py-1 text-right">Horas</th>
                    </tr>
                  </thead>
                  <tbody>
                    {f.dias.map((d) => (
                      <tr key={d.data} className="border-t border-neutral-700/50">
                        <td className="py-2 pr-3 whitespace-nowrap">{d.data.split('-').reverse().join('/')}</td>
                        <td className="py-2 pr-3 text-neutral-300">
                          {d.marcacoes.map((m, i) => (
                            <span key={i} className="mr-2 inline-block">
                              <span className="text-neutral-500">{TIPO_LABEL[m.tipo].split(' ')[0]}</span> {m.hora}
                            </span>
                          ))}
                        </td>
                        <td className="py-2 text-right font-mono">{minParaHoras(d.minutosTrabalhados)}</td>
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
