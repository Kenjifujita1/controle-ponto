import type { TipoMarcacao } from '../types'

export interface MarcacaoBruta {
  funcionario_id: string
  tipo: TipoMarcacao
  registrado_em: string
}

export interface DiaTrabalhado {
  data: string // YYYY-MM-DD
  marcacoes: { tipo: TipoMarcacao; hora: string }[]
  minutosTrabalhados: number
}

const CLOCK_IN: TipoMarcacao[] = ['entrada', 'fim_intervalo']
const CLOCK_OUT: TipoMarcacao[] = ['saida', 'inicio_intervalo']

function dataLocal(iso: string): string {
  return new Date(iso).toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' }) // YYYY-MM-DD
}
function horaLocal(iso: string): string {
  return new Date(iso).toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'America/Sao_Paulo',
  })
}

/** Agrupa as marcações de UM funcionário por dia e calcula minutos trabalhados. */
export function calcularDias(marcacoes: MarcacaoBruta[]): DiaTrabalhado[] {
  const ordenadas = [...marcacoes].sort(
    (a, b) => +new Date(a.registrado_em) - +new Date(b.registrado_em),
  )
  const porDia = new Map<string, MarcacaoBruta[]>()
  for (const m of ordenadas) {
    const d = dataLocal(m.registrado_em)
    if (!porDia.has(d)) porDia.set(d, [])
    porDia.get(d)!.push(m)
  }

  const dias: DiaTrabalhado[] = []
  for (const [data, ms] of porDia) {
    let minutos = 0
    let entradaEm: number | null = null
    for (const m of ms) {
      const t = new Date(m.registrado_em).getTime()
      if (CLOCK_IN.includes(m.tipo)) {
        entradaEm = t
      } else if (CLOCK_OUT.includes(m.tipo) && entradaEm != null) {
        minutos += Math.round((t - entradaEm) / 60000)
        entradaEm = null
      }
    }
    dias.push({
      data,
      marcacoes: ms.map((m) => ({ tipo: m.tipo, hora: horaLocal(m.registrado_em) })),
      minutosTrabalhados: minutos,
    })
  }
  return dias.sort((a, b) => a.data.localeCompare(b.data))
}

export function minParaHoras(min: number): string {
  const h = Math.floor(min / 60)
  const m = min % 60
  return `${h}h${m.toString().padStart(2, '0')}`
}
