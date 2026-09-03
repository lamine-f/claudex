import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { expect, test } from '@playwright/test'
import { fermer, lancer, type Contexte } from './fixtures'

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
    await ctx.page.getByRole('button', { name: /FICHIERS/ }).click()
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
