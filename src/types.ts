export type Papel = 'admin' | 'supervisor'
export type TipoMarcacao = 'entrada' | 'saida' | 'inicio_intervalo' | 'fim_intervalo'
export type MetodoMarcacao = 'facial' | 'pin'

export interface Perfil {
  id: string
  nome: string
  papel: Papel
}

export interface Local {
  id: string
  nome: string
  latitude: number | null
  longitude: number | null
  raio_metros: number
  ips_permitidos: string[]
  ativo: boolean
  email_alertas?: string | null
  telefone_alertas?: string | null
  horas_limite_saida?: number
}

export interface Equipe {
  id: string
  nome: string
  supervisor_id: string | null
}

export interface Funcionario {
  id: string
  nome: string
  matricula: string | null
  cpf: string | null
  equipe_id: string | null
  local_id: string | null
  jornada_diaria_min: number
  ativo: boolean
  // face_descriptor e pin_hash nunca chegam ao cliente do quiosque
}

export interface Marcacao {
  id: string
  funcionario_id: string
  tipo: TipoMarcacao
  metodo: MetodoMarcacao
  registrado_em: string
  local_id: string | null
  distancia_m: number | null
  confianca: number | null
  local_valido: boolean
}

export const TIPO_LABEL: Record<TipoMarcacao, string> = {
  entrada: 'Entrada',
  saida: 'Saída',
  inicio_intervalo: 'Início do intervalo',
  fim_intervalo: 'Fim do intervalo',
}
