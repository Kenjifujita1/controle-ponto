// Reconhecimento facial 100% no navegador (on-device).
// A imagem do rosto NUNCA sai do aparelho — só o descritor (128 números).
// A biblioteca (pesada) é carregada sob demanda, só quando a câmera é usada.
type FaceApi = typeof import('@vladmandic/face-api')

const MODEL_URL = '/models'
let faceapi: FaceApi | null = null
let opcoes: InstanceType<FaceApi['TinyFaceDetectorOptions']> | null = null
let carregado = false
let carregando: Promise<void> | null = null

export async function carregarModelos(): Promise<void> {
  if (carregado) return
  if (carregando) return carregando
  carregando = (async () => {
    faceapi = await import('@vladmandic/face-api')
    await Promise.all([
      faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
      faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
      faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL),
    ])
    opcoes = new faceapi.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: 0.5 })
    carregado = true
  })()
  return carregando
}

/** Extrai o descritor facial (128 floats) de um vídeo/imagem. Null se não achar rosto. */
export async function extrairDescritor(
  el: HTMLVideoElement | HTMLImageElement,
): Promise<number[] | null> {
  await carregarModelos()
  const res = await faceapi!
    .detectSingleFace(el, opcoes!)
    .withFaceLandmarks()
    .withFaceDescriptor()
  if (!res) return null
  return Array.from(res.descriptor)
}

/** Distância euclidiana entre dois descritores. Quanto menor, mais parecido. */
export function distancia(a: number[], b: number[]): number {
  let s = 0
  for (let i = 0; i < a.length; i++) {
    const d = a[i] - b[i]
    s += d * d
  }
  return Math.sqrt(s)
}

// Limiar típico do face-api: < 0.5 = mesma pessoa (mais rígido = mais seguro).
export const LIMIAR_MATCH = 0.5

/** Converte distância em "confiança" 0-1 para exibir ao usuário. */
export function confiancaDe(dist: number): number {
  return Math.max(0, Math.min(1, 1 - dist / LIMIAR_MATCH / 2))
}
