// Copia os modelos do face-api (já vêm no pacote npm) para public/models,
// para o navegador carregar em /models. Rode: node scripts/setup-models.mjs
import { cp, mkdir, readdir } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const raiz = dirname(dirname(fileURLToPath(import.meta.url)))
const origem = join(raiz, 'node_modules', '@vladmandic', 'face-api', 'model')
const destino = join(raiz, 'public', 'models')

// modelos necessários (tiny detector + landmarks + recognition)
const necessarios = ['tiny_face_detector', 'face_landmark_68', 'face_recognition']

if (!existsSync(origem)) {
  console.warn('⚠ Modelos do face-api não encontrados em node_modules. Rode `npm run setup:models` após o install.')
  process.exit(0)
}

await mkdir(destino, { recursive: true })
const arquivos = await readdir(origem)
let copiados = 0
for (const arq of arquivos) {
  if (necessarios.some((n) => arq.startsWith(n))) {
    await cp(join(origem, arq), join(destino, arq))
    copiados++
  }
}
console.log(`✅ ${copiados} arquivos de modelo copiados para public/models`)
