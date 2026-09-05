import { execFile } from 'node:child_process'
import { mkdir, writeFile } from 'node:fs/promises'
import { promisify } from 'node:util'
import { join } from 'node:path'
import { expect, test } from '@playwright/test'
import { fermer, lancer, type Contexte } from './fixtures'

const run = promisify(execFile)

/** Un PNG valide d'un pixel, écrit tel quel plutôt que fabriqué à la volée. */
const PIXEL = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64'
)

test.describe('arborescence et aperçu', () => {
  let ctx: Contexte

  test.beforeAll(async () => {
    const provisoire = await lancer()
    const p = provisoire.projet
    await mkdir(join(p, 'src'), { recursive: true })
    // Un dossier que ce seul cas déplie : les autres touchent à `src`, et son
    // état de dépli dépendrait alors de l'ordre d'exécution.
    await mkdir(join(p, 'profond', 'sous'), { recursive: true })
    await mkdir(join(p, 'node_modules', 'paquet'), { recursive: true })
    await writeFile(join(p, 'lisezmoi.md'), '# Titre\n\nUn paragraphe.\n')
    await writeFile(join(p, 'src', 'app.ts'), 'export const salut = "bonjour"\n')
    await writeFile(join(p, 'profond', 'sous', 'deja.ts'), 'export const deja = 1\n')
    await writeFile(join(p, 'node_modules', 'paquet', 'index.js'), 'module.exports = 1\n')
    // Un binaire : l'aperçu doit le refuser explicitement plutôt que l'afficher.
    await writeFile(join(p, 'image.bin'), Buffer.from([0x89, 0x50, 0x00, 0x01, 0x02]))
    // Une vraie image d'un pixel : c'est elle qui éprouve la chaîne entière,
    // de l'extension reconnue au flux servi par le schéma dédié.
    await writeFile(join(p, 'pixel.png'), PIXEL)
    await fermer(provisoire, { nettoyer: false })
    ctx = await lancer({ donnees: provisoire.donnees, projet: provisoire.projet })
    // L'arborescence partage sa colonne avec les conversations : il faut la
    // demander, elle n'est plus visible en permanence.
    await ctx.page.getByRole('button', { name: 'Fichiers', exact: true }).click()
  })

  test.afterAll(async () => {
    await fermer(ctx)
  })

  test('le contenu du projet apparaît, dossiers en tête', async () => {
    await expect(ctx.page.getByText('src', { exact: true })).toBeVisible()
    await expect(ctx.page.getByText('lisezmoi.md')).toBeVisible()
  })

  test('node_modules est écarté', async () => {
    await expect(ctx.page.getByText('node_modules')).toHaveCount(0)
  })

  test('un dossier se déplie et montre son contenu', async () => {
    await ctx.page.getByText('src', { exact: true }).click()
    await expect(ctx.page.getByText('app.ts')).toBeVisible()
  })

  test("un fichier texte s'ouvre en aperçu avec son contenu", async () => {
    await ctx.page.getByText('app.ts').click()
    await expect(ctx.page.getByText('export const salut')).toBeVisible()
  })

  test('Échap referme l’aperçu', async () => {
    await ctx.page.keyboard.press('Escape')
    await expect(ctx.page.getByText('export const salut')).toHaveCount(0)
  })

  test('un binaire est refusé explicitement, pas affiché en charabia', async () => {
    await ctx.page.getByText('image.bin').click()
    await expect(ctx.page.getByText(/Fichier binaire/)).toBeVisible()
    await ctx.page.keyboard.press('Escape')
  })

  test('un fichier créé hors de l’application apparaît sans rien cliquer', async () => {
    await writeFile(join(ctx.projet, 'apparu.txt'), 'créé par un agent\n')
    await expect(ctx.page.getByText('apparu.txt')).toBeVisible({ timeout: 10_000 })
  })

  test('une image s’affiche vraiment, au lieu d’être dite binaire', async () => {
    await ctx.page.getByText('pixel.png').click()
    const image = ctx.page.locator('img[src^="claudex-media:"]')
    await expect(image).toBeVisible()
    // Visible ne suffit pas : une image que le schéma n'aurait pas servie
    // occuperait la même place sans rien montrer.
    await expect
      .poll(async () => image.evaluate((e: HTMLImageElement) => e.naturalWidth))
      .toBe(1)
    await ctx.page.keyboard.press('Escape')
  })

  test('le clic droit à côté des lignes relit l’arborescence', async () => {
    await ctx.page.getByText('profond', { exact: true }).click()
    await ctx.page.getByText('sous', { exact: true }).click()
    await expect(ctx.page.getByText('deja.ts')).toBeVisible()

    // Le veilleur ne descend que de deux niveaux : ce fichier-là lui échappe,
    // et seule une relecture demandée peut le faire apparaître. C'est
    // exactement ce à quoi sert l'entrée du menu.
    await writeFile(join(ctx.projet, 'profond', 'sous', 'tard.ts'), 'export const tard = 1\n')
    await expect(ctx.page.getByText('tard.ts')).toHaveCount(0)

    // Sous la dernière ligne : là, le clic droit ne vise plus une entrée mais
    // le projet lui-même.
    const arbre = ctx.page.getByLabel('Arborescence')
    const cadre = await arbre.boundingBox()
    if (!cadre) throw new Error('l’arborescence n’est pas à l’écran')
    await ctx.page.mouse.click(cadre.x + 30, cadre.y + cadre.height - 12, { button: 'right' })

    await ctx.page.getByRole('menuitem', { name: 'Relire l’arborescence' }).click()
    await expect(ctx.page.getByText('tard.ts')).toBeVisible()
  })

  test('le clic droit sur un dossier propose d’en faire un projet', async () => {
    await ctx.page.getByText('src', { exact: true }).click({ button: 'right' })
    const menu = ctx.page.getByRole('menu')
    await expect(menu.getByRole('menuitem', { name: 'Relire ce dossier' })).toBeVisible()
    await menu.getByRole('menuitem', { name: 'Ouvrir comme projet' }).click()

    // Le dossier rejoint le rail et devient le projet courant.
    await expect(ctx.page.getByLabel('Projets').locator('li', { hasText: 'src' })).toHaveCount(1)
  })
})

test.describe('lecture de l’arborescence', () => {
  let ctx: Contexte

  test.beforeAll(async () => {
    const provisoire = await lancer()
    const p = provisoire.projet
    await mkdir(join(p, 'sorties'), { recursive: true })
    await writeFile(join(p, '.gitignore'), 'sorties/\n')
    await writeFile(join(p, 'app.ts'), 'export const x = 1\n')
    await writeFile(join(p, 'sorties', 'bundle.js'), 'var a\n')
    // Un dépôt git, sans quoi rien n'est « ignoré » au sens de git.
    await run('git', ['-C', p, 'init', '-q'])
    await fermer(provisoire, { nettoyer: false })
    ctx = await lancer({ donnees: provisoire.donnees, projet: provisoire.projet })
    await ctx.page.getByRole('button', { name: 'Fichiers', exact: true }).click()
  })

  test.afterAll(async () => {
    await fermer(ctx)
  })

  test('un fichier porte l’icône de son type', async () => {
    // L'icône se lit plus vite que l'extension elle-même dans une liste.
    const image = ctx.page.locator('li', { hasText: 'app.ts' }).locator('img')
    await expect(image).toHaveAttribute('src', /typescript/)
  })

  test('un type inconnu retombe sur l’icône par défaut', async () => {
    await writeFile(join(ctx.projet, 'note.zzzz'), 'rien\n')
    const image = ctx.page.locator('li', { hasText: 'note.zzzz' }).locator('img')
    await expect(image).toHaveAttribute('src', /file\.svg$/, { timeout: 10_000 })
  })

  test('un dossier connu porte son icône propre', async () => {
    await mkdir(join(ctx.projet, 'src'), { recursive: true })
    const image = ctx.page.locator('li', { hasText: /^src$/ }).locator('img')
    await expect(image).toHaveAttribute('src', /folder-src/, { timeout: 10_000 })
  })

  test('ce que git ignore se distingue sans être caché', async () => {
    const ignore = ctx.page.locator('li', { hasText: 'sorties' }).locator('span', {
      hasText: /^sorties$/
    })
    await expect(ignore).toBeVisible()
    await expect(ignore).toHaveClass(/italic/)

    // Un fichier du projet, lui, reste en droit.
    const suivi = ctx.page.locator('li', { hasText: 'app.ts' }).locator('span', {
      hasText: /^app\.ts$/
    })
    await expect(suivi).not.toHaveClass(/italic/)
  })
})
