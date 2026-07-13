import { useEffect, useRef, useState } from 'react'
import { carregarModelos, extrairDescritor } from '../lib/face'

interface Props {
  onCapturar: (descritor: number[]) => void
  onCancelar: () => void
}

// Modal de captura facial para o cadastro de funcionários.
export default function CapturaFacial({ onCapturar, onCancelar }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [pronto, setPronto] = useState(false)
  const [msg, setMsg] = useState('Preparando câmera…')
  const [processando, setProcessando] = useState(false)

  useEffect(() => {
    let stream: MediaStream | null = null
    ;(async () => {
      try {
        await carregarModelos()
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'user', width: 480, height: 480 },
          audio: false,
        })
        if (videoRef.current) videoRef.current.srcObject = stream
        setPronto(true)
        setMsg('Centralize o rosto e capture')
      } catch {
        setMsg('Não foi possível acessar a câmera.')
      }
    })()
    return () => stream?.getTracks().forEach((t) => t.stop())
  }, [])

  async function capturar() {
    if (!videoRef.current) return
    setProcessando(true)
    setMsg('Analisando rosto…')
    const d = await extrairDescritor(videoRef.current)
    if (!d) {
      setMsg('Rosto não detectado. Melhore a luz e tente de novo.')
      setProcessando(false)
      return
    }
    onCapturar(d)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="card w-full max-w-sm">
        <h3 className="mb-1 text-center text-lg font-semibold text-white">Capturar rosto</h3>
        <p className="mb-3 min-h-[1.25rem] text-center text-sm text-neutral-400">{msg}</p>
        <div className="mb-4 overflow-hidden rounded-xl">
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="aspect-square w-full scale-x-[-1] bg-black object-cover"
          />
        </div>
        <div className="flex gap-2">
          <button className="btn-ghost flex-1" onClick={onCancelar}>
            Cancelar
          </button>
          <button className="btn-primary flex-1" disabled={!pronto || processando} onClick={capturar}>
            {processando ? 'Analisando…' : 'Capturar'}
          </button>
        </div>
      </div>
    </div>
  )
}
