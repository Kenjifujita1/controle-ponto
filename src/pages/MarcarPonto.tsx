import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { carregarModelos, extrairDescritor } from '../lib/face'
import { obterPosicao } from '../lib/geo'
import { functionsUrl } from '../lib/supabase'
import { TIPO_LABEL, type TipoMarcacao } from '../types'
import { BADGE, HANDLE, MARCA } from '../branding'

type Etapa = 'preparando' | 'identificar' | 'confirmar' | 'processando' | 'sucesso'

interface Identidade {
  primeiro_nome: string
  funcionario: string
  proximas: TipoMarcacao[]
  token: string
}
interface Resultado {
  funcionario: string
  tipo: TipoMarcacao
  hora: string
  metodo: 'facial' | 'pin'
  local_valido: boolean
}

// estilo de cada ação (preto e branco; emoji diferencia)
const ESTILO: Record<TipoMarcacao, string> = {
  entrada: 'bg-white text-black hover:bg-neutral-200',
  saida: 'bg-white text-black hover:bg-neutral-200',
  fim_intervalo: 'bg-white text-black hover:bg-neutral-200',
  inicio_intervalo: 'bg-neutral-900 text-white border border-neutral-600 hover:bg-neutral-800',
}
const EMOJI: Record<TipoMarcacao, string> = {
  entrada: '🟢', saida: '🔴', inicio_intervalo: '⏸️', fim_intervalo: '▶️',
}

export default function MarcarPonto() {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const [etapa, setEtapa] = useState<Etapa>('preparando')
  const [msg, setMsg] = useState('Preparando câmera e reconhecimento…')
  const [ident, setIdent] = useState<Identidade | null>(null)
  const [resultado, setResultado] = useState<Resultado | null>(null)
  const [usarPin, setUsarPin] = useState(false)
  const [matricula, setMatricula] = useState('')
  const [pin, setPin] = useState('')

  useEffect(() => {
    ;(async () => {
      try {
        await carregarModelos()
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: 480, height: 480 }, audio: false })
        streamRef.current = stream
        if (videoRef.current) videoRef.current.srcObject = stream
        setEtapa('identificar')
        setMsg('Aproxime o rosto e toque em identificar')
      } catch {
        setEtapa('identificar')
        setUsarPin(true)
        setMsg('Câmera indisponível — use matrícula + PIN')
      }
    })()
    return () => streamRef.current?.getTracks().forEach((t) => t.stop())
  }, [])

  // Reconecta o stream sempre que o elemento de vídeo (re)aparece na tela —
  // corrige a câmera "travada" ao voltar para a tela de identificar.
  function attachVideo(el: HTMLVideoElement | null) {
    videoRef.current = el
    if (el && streamRef.current && el.srcObject !== streamRef.current) {
      el.srcObject = streamRef.current
      el.play?.().catch(() => {})
    }
  }

  async function chamar(payload: Record<string, unknown>) {
    const res = await fetch(`${functionsUrl}/marcar-ponto`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}` },
      body: JSON.stringify(payload),
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.erro || 'Falha na operação')
    return data
  }

  // ---- ETAPA 1: identificar ----
  async function identificarFacial() {
    if (!videoRef.current) return
    setEtapa('processando')
    setMsg('Reconhecendo…')
    try {
      const descritor = await extrairDescritor(videoRef.current)
      if (!descritor) { setEtapa('identificar'); setMsg('Rosto não detectado. Melhore a luz ou use o PIN.'); return }
      const data = await chamar({ acao: 'identificar', metodo: 'facial', descritor })
      setIdent(data)
      setEtapa('confirmar')
    } catch (e) {
      setEtapa('identificar'); setMsg((e as Error).message)
    }
  }
  async function identificarPin(e: React.FormEvent) {
    e.preventDefault()
    setEtapa('processando')
    setMsg('Validando…')
    try {
      const data = await chamar({ acao: 'identificar', metodo: 'pin', matricula, pin })
      setIdent(data)
      setPin('')
      setEtapa('confirmar')
    } catch (err) {
      setEtapa('identificar'); setMsg((err as Error).message)
    }
  }

  // ---- ETAPA 2: registrar a ação escolhida ----
  async function registrar(tipo: TipoMarcacao) {
    if (!ident) return
    setEtapa('processando')
    setMsg('Registrando…')
    try {
      const pos = await posicaoOpcional()
      const data = await chamar({ acao: 'registrar', token: ident.token, tipo, ...pos })
      setResultado(data)
      setEtapa('sucesso')
    } catch (e) {
      setMsg((e as Error).message)
      setEtapa('identificar')
      setIdent(null)
    }
  }

  function reiniciar() {
    setResultado(null); setIdent(null); setMatricula(''); setPin('')
    setEtapa('identificar'); setMsg('Aproxime o rosto e toque em identificar')
  }

  // ===== TELA: sucesso =====
  if (etapa === 'sucesso' && resultado) {
    return (
      <Tela>
        <div className="card w-full max-w-sm text-center">
          <div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-full border border-white/25 bg-white/10 text-4xl">✓</div>
          <h2 className="text-2xl font-bold text-white">{resultado.funcionario}</h2>
          <p className="mt-1 text-lg text-neutral-300">{TIPO_LABEL[resultado.tipo]} registrada</p>
          <p className="mt-3 text-3xl font-mono">{resultado.hora}</p>
          <div className="mt-4 flex flex-wrap justify-center gap-2 text-xs">
            <span className="rounded-full bg-neutral-800 px-3 py-1">{resultado.metodo === 'facial' ? '🙂 Facial' : '🔢 PIN'}</span>
            <span className="rounded-full bg-neutral-800 px-3 py-1">{resultado.local_valido ? '📍 No local' : '⚠ Fora do local'}</span>
          </div>
          <button className="btn-primary mt-6 w-full" onClick={reiniciar}>Próxima pessoa</button>
        </div>
      </Tela>
    )
  }

  // ===== TELA: confirmar ação =====
  if (etapa === 'confirmar' && ident) {
    return (
      <Tela>
        <div className="w-full max-w-sm text-center">
          <p className="text-sm text-neutral-400">Olá,</p>
          <h1 className="mb-1 text-3xl font-bold text-white">{ident.primeiro_nome} 👋</h1>
          <p className="mb-6 text-sm text-neutral-400">O que você quer registrar agora?</p>
          <div className="space-y-3">
            {ident.proximas.map((t) => (
              <button
                key={t}
                onClick={() => registrar(t)}
                className={`btn w-full py-5 text-lg font-bold ${ESTILO[t]}`}
              >
                {EMOJI[t]} {TIPO_LABEL[t]}
              </button>
            ))}
          </div>
          <button className="btn-ghost mt-6 w-full" onClick={reiniciar}>Não sou eu / cancelar</button>
        </div>
      </Tela>
    )
  }

  // ===== TELA: identificar =====
  return (
    <Tela>
      <div className="w-full max-w-sm">
        <div className="mb-3 text-center">
          <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-xl border border-neutral-700 bg-black text-base font-bold tracking-wide text-white">{BADGE}</div>
          <p className="text-xs text-neutral-500">{MARCA}{HANDLE ? ` · ${HANDLE}` : ''}</p>
        </div>
        <h1 className="mb-1 text-center text-2xl font-bold text-white">Bater ponto</h1>
        <p className="mb-4 min-h-[1.5rem] text-center text-sm text-neutral-400">{msg}</p>

        {!usarPin && (
          <div className="card mb-4 overflow-hidden p-0">
            <video ref={attachVideo} autoPlay playsInline muted className="aspect-square w-full scale-x-[-1] bg-black object-cover" />
          </div>
        )}

        {!usarPin ? (
          <>
            <button className="btn-primary w-full text-lg" disabled={etapa !== 'identificar'} onClick={identificarFacial}>
              {etapa === 'processando' ? 'Processando…' : 'Identificar'}
            </button>
            <button className="btn-ghost mt-2 w-full" onClick={() => setUsarPin(true)}>Usar matrícula + PIN</button>
          </>
        ) : (
          <form onSubmit={identificarPin} className="space-y-3">
            <input className="input" placeholder="Matrícula" value={matricula} onChange={(e) => setMatricula(e.target.value)} required />
            <input className="input" placeholder="PIN" type="password" inputMode="numeric" value={pin} onChange={(e) => setPin(e.target.value)} required />
            <button className="btn-primary w-full" disabled={etapa === 'processando'}>
              {etapa === 'processando' ? 'Processando…' : 'Identificar'}
            </button>
            <button type="button" className="btn-ghost w-full" onClick={() => setUsarPin(false)}>Voltar para facial</button>
          </form>
        )}

        <p className="mt-6 text-center text-[11px] leading-tight text-neutral-600">
          🔒 Sua imagem não é armazenada. O reconhecimento acontece no aparelho e só um código matemático do rosto é usado para identificar você.
        </p>
        <div className="mt-3 text-center">
          <Link to="/login" className="text-xs text-neutral-500 hover:text-neutral-300">Acesso do gestor</Link>
        </div>
      </div>
    </Tela>
  )
}

async function posicaoOpcional() {
  try {
    const p = await obterPosicao()
    return { latitude: p.latitude, longitude: p.longitude }
  } catch {
    return {}
  }
}

function Tela({ children }: { children: React.ReactNode }) {
  return <div className="flex min-h-screen items-center justify-center p-4">{children}</div>
}
