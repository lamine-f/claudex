import { execFile } from 'node:child_process'
import { mkdir, writeFile } from 'node:fs/promises'
import { promisify } from 'node:util'
import { join } from 'node:path'
import { expect, test } from '@playwright/test'
import { fermer, lancer, type Contexte } from './fixtures'

const run = promisify(execFile)

test.describe('arborescence et aperçu', () => {
  let ctx: Contexte

  test.beforeAll(async () => {
    const provisoire = await lancer()
    const p = provisoire.projet
    await mkdir(join(p, 'src'), { recursive: true })
    await mkdir(join(p, 'node_modules', 'paquet'), { recursive: true })
    await writeFile(join(p, 'lisezmoi.md'), '# Titre\n\nUn paragraphe.\n')
    await writeFile(join(p, 'src', 'app.ts'), 'export const salut = "bonjour"\n')
    await writeFile(join(p, 'node_modules', 'paquet', 'index.js'), 'module.exports = 1\n')
    // Un binaire : l'aperçu doit le refuser explicitement plutôt que l'afficher.
    await writeFile(join(p, 'image.bin'), Buffer.from([0x89, 0x50, 0x00, 0x01, 0x02]))
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
