import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { TIPO_LABEL, type TipoMarcacao } from '../../types'

interface Linha {
  id: string
  registrado_em: string
  tipo: TipoMarcacao
  metodo: string
  local_valido: boolean
  ponto_funcionarios: { nome: string } | null
}

export default function Dashboard() {
  const [linhas, setLinhas] = useState<Linha[]>([])
  const [carregando, setCarregando] = useState(true)

  useEffect(() => {
    ;(async () => {
      const hoje = new Date()
      hoje.setHours(0, 0, 0, 0)
      const { data } = await supabase
        .from('ponto_marcacoes')
        .select('id, registrado_em, tipo, metodo, local_valido, ponto_funcionarios(nome)')
        .gte('registrado_em', hoje.toISOString())
        .order('registrado_em', { ascending: false })
      setLinhas((data as unknown as Linha[]) ?? [])
      setCarregando(false)
    })()
  }, [])

  return (
    <div>
      <h2 className="mb-4 text-lg font-semibold text-white">Marcações de hoje</h2>
      {carregando ? (
        <p className="text-neutral-400">Carregando…</p>
      ) : linhas.length === 0 ? (
        <div className="card text-center text-neutral-400">Nenhuma marcação registrada hoje.</div>
      ) : (
        <div className="space-y-2">
          {linhas.map((l) => (
            <div key={l.id} className="card flex items-center justify-between py-3">
              <div>
                <p className="font-medium text-white">{l.ponto_funcionarios?.nome ?? '—'}</p>
                <p className="text-sm text-neutral-400">{TIPO_LABEL[l.tipo]}</p>
              </div>
              <div className="text-right">
                <p className="font-mono text-lg">
                  {new Date(l.registrado_em).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                </p>
                <p className={`text-xs ${l.local_valido ? 'text-neutral-300' : 'text-neutral-500'}`}>
                  {l.local_valido ? 'No local' : 'Fora do local'} · {l.metodo}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
