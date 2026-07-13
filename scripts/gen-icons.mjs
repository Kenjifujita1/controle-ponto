// Gera os ícones PNG do PWA (preto e branco) a partir de um SVG.
// Personalize a sigla/subtítulo por variável de ambiente:
//   APP_BADGE=CP APP_SUBTITLE=PONTO node scripts/gen-icons.mjs
import sharp from 'sharp'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const raiz = dirname(dirname(fileURLToPath(import.meta.url)))
const publicDir = join(raiz, 'public')

const BADGE = (process.env.APP_BADGE || 'CP').slice(0, 3)
const SUBTITLE = (process.env.APP_SUBTITLE || 'PONTO').slice(0, 12)

// SVG 512x512: fundo preto full-bleed (bom para maskable) + sigla branca central
const svg = (size) => `
<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 512 512">
  <rect width="512" height="512" fill="#000000"/>
  <text x="256" y="330" font-family="Arial, Helvetica, sans-serif" font-size="230" font-weight="700"
        text-anchor="middle" fill="#ffffff" letter-spacing="4">${BADGE}</text>
  <text x="256" y="410" font-family="Arial, Helvetica, sans-serif" font-size="44" font-weight="500"
        text-anchor="middle" fill="#ffffff" opacity="0.75" letter-spacing="2">${SUBTITLE}</text>
</svg>`

const alvos = [
  { nome: 'pwa-192.png', size: 192 },
  { nome: 'pwa-512.png', size: 512 },
  { nome: 'apple-touch-icon.png', size: 180 },
]

for (const a of alvos) {
  await sharp(Buffer.from(svg(a.size))).resize(a.size, a.size).png().toFile(join(publicDir, a.nome))
  console.log(`✅ ${a.nome} (${a.size}px)`)
}
