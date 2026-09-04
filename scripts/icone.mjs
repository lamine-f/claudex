/**
 * Compose l'icône de l'application à partir du logo.
 *
 *   node scripts/icone.mjs
 *
 * Écrit `build/icon.png`, l'icône du paquet, et `docs/logo.png`, celle du
 * README. Les deux sur fond transparent : un carré blanc derrière l'icône se
 * voyait dans le Dock et en tête de la page du dépôt.
 *
 * Le rendu passe par Chromium, déjà là pour les tests, plutôt que par une
 * bibliothèque d'images de plus.
 */
import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { chromium } from '@playwright/test'

const COTE = 1024
const RAYON = 228
const FOND = '#0a0908'
const BORDURE = '#2e2a26'
/** Part du côté occupée par le logo. Le reste est la marge de sécurité. */
const PART = 0.62

const logo = await readFile(resolve('src/renderer/public/logo.png'))
const source = `data:image/png;base64,${logo.toString('base64')}`

const navigateur = await chromium.launch()
const page = await navigateur.newPage()

const rendre = async (taille) =>
  page.evaluate(
    async ([source, taille, cote, rayon, fond, bordure, part]) => {
      const image = new Image()
      await new Promise((suite, echec) => {
        image.onload = suite
        image.onerror = echec
        image.src = source
      })

      const canevas = document.createElement('canvas')
      canevas.width = cote
      canevas.height = cote
      const c = canevas.getContext('2d')

      // Le carré arrondi, sur fond transparent : hors de lui, rien.
      c.beginPath()
      c.roundRect(0, 0, cote, cote, rayon)
      c.fillStyle = fond
      c.fill()
      c.lineWidth = cote / 64
      c.strokeStyle = bordure
      c.beginPath()
      c.roundRect(c.lineWidth / 2, c.lineWidth / 2, cote - c.lineWidth, cote - c.lineWidth, rayon)
      c.stroke()

      // Le logo, centré, à taille égale quel que soit son rapport.
      const echelle = (cote * part) / Math.max(image.width, image.height)
      const l = image.width * echelle
      const h = image.height * echelle
      c.drawImage(image, (cote - l) / 2, (cote - h) / 2, l, h)

      const rendu = document.createElement('canvas')
      rendu.width = taille
      rendu.height = taille
      const r = rendu.getContext('2d')
      r.imageSmoothingQuality = 'high'
      r.drawImage(canevas, 0, 0, taille, taille)
      return rendu.toDataURL('image/png')
    },
    [source, taille, COTE, RAYON, FOND, BORDURE, PART]
  )

for (const [chemin, taille] of [
  ['build/icon.png', COTE],
  ['docs/logo.png', 512]
]) {
  const url = await rendre(taille)
  await writeFile(resolve(chemin), Buffer.from(url.split(',')[1], 'base64'))
  console.log('  écrit :', chemin, `${taille}×${taille}`)
}

await navigateur.close()
