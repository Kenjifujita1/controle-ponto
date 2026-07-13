// Geolocalização (GPS) do dispositivo.

export interface Posicao {
  latitude: number
  longitude: number
  precisao: number
}

export function obterPosicao(): Promise<Posicao> {
  return new Promise((resolve, reject) => {
    if (!('geolocation' in navigator)) {
      reject(new Error('GPS não disponível neste dispositivo'))
      return
    }
    navigator.geolocation.getCurrentPosition(
      (p) =>
        resolve({
          latitude: p.coords.latitude,
          longitude: p.coords.longitude,
          precisao: p.coords.accuracy,
        }),
      (err) => reject(new Error(traduzErro(err))),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
    )
  })
}

function traduzErro(err: GeolocationPositionError): string {
  switch (err.code) {
    case err.PERMISSION_DENIED:
      return 'Permissão de localização negada. Ative o GPS para bater o ponto.'
    case err.POSITION_UNAVAILABLE:
      return 'Localização indisponível no momento.'
    case err.TIMEOUT:
      return 'Tempo esgotado ao obter a localização.'
    default:
      return 'Não foi possível obter a localização.'
  }
}

/** Distância em metros entre dois pontos (fórmula de Haversine). */
export function distanciaMetros(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const R = 6371000
  const rad = (g: number) => (g * Math.PI) / 180
  const dLat = rad(lat2 - lat1)
  const dLon = rad(lon2 - lon1)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLon / 2) ** 2
  return Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)))
}
