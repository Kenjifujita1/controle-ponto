// Identidade visual do sistema — configurável por variáveis de ambiente.
// Personalize no .env (VITE_APP_NAME, VITE_APP_HANDLE, VITE_APP_BADGE).
function iniciais(nome: string): string {
  return nome
    .split(/\s+/)
    .filter(Boolean)
    .map((p) => p[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()
}

export const MARCA = import.meta.env.VITE_APP_NAME || 'Controle de Ponto'
export const HANDLE = import.meta.env.VITE_APP_HANDLE || ''
export const BADGE = import.meta.env.VITE_APP_BADGE || iniciais(MARCA)
