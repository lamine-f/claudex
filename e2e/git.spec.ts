import { execFile } from 'node:child_process'
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { expect, test } from '@playwright/test'
import { fermer, lancer, type Contexte } from './fixtures'

const run = promisify(execFile)

/** Un dépôt avec un premier commit, sur la branche demandée. */
async function depot(chemin: string, branche: string): Promise<void> {
  await mkdir(chemin, { recursive: true })
  await run('git', ['-C', chemin, 'init', '-q', '-b', branche])
  await run('git', ['-C', chemin, 'config', 'user.email', 'essai@claudex'])
  await run('git', ['-C', chemin, 'config', 'user.name', 'Essai'])
  await writeFile(join(chemin, 'base.txt'), 'un\n')
  await run('git', ['-C', chemin, 'add', '-A'])
  await run('git', ['-C', chemin, 'commit', '-qm', 'base'])
}

/**
 * La forme réelle du projet de travail : un dossier qui n'est pas un dépôt et
 * qui en contient plusieurs, sur des branches différentes. Claudex n'affichait
 * rien du tout dans ce cas, faute de chercher plus loin que le dossier lui-même.
 */
test.describe('état git d’un projet à plusieurs dépôts', () => {
  let ctx: Contexte

  test.beforeAll(async () => {
    const projet = await mkdtemp(join(tmpdir(), 'claudex-depots-'))
    await depot(join(projet, 'coeur'), 'local')
    await depot(join(projet, 'passerelle'), 'master')
    await depot(join(projet, 'repos'), 'local')

    // Deux dépôts sur trois ont de quoi être commités.
    await writeFile(join(projet, 'coeur', 'base.txt'), 'deux\n')
    await writeFile(join(projet, 'passerelle', 'neuf.txt'), 'neuf\n')

    ctx = await lancer({ projet })
  })

  test.afterAll(async () => {
    await fermer(ctx)
  })

  test('compte les dépôts qui ont des changements', async () => {
    const mesure = ctx.page.getByTitle(/dépôt\(s\) avec des changements/)
    await expect(mesure).toContainText('2/3')
  })

  test('tait la branche quand les dépôts divergent', async () => {
    // La prémisse d'abord : sans elle, l'absence de branche se vérifierait
    // aussi bien sur un projet dont rien n'a été lu.
    await expect(ctx.page.getByTitle(/dépôt\(s\) avec des changements/)).toBeVisible()

    // Trois dépôts sur deux branches : en annoncer une ferait croire que le
    // projet y est tout entier.
    await expect(ctx.page.getByTitle('Branche commune aux dépôts du projet')).toHaveCount(0)
    await expect(ctx.page.getByTitle('Branche courante')).toHaveCount(0)
  })

  test('additionne les fichiers de tous les dépôts', async () => {
    await expect(ctx.page.getByTitle('1 fichier modifié')).toBeVisible()
    await expect(ctx.page.getByTitle('1 fichier non suivi')).toBeVisible()
  })
})

test.describe('état git d’un projet qui est lui-même un dépôt', () => {
  let ctx: Contexte

  test.beforeAll(async () => {
    const projet = await mkdtemp(join(tmpdir(), 'claudex-depot-'))
    await depot(projet, 'principale')
    ctx = await lancer({ projet })
  })

  test.afterAll(async () => {
    await fermer(ctx)
  })

  test('annonce sa branche, sans compte de dépôts', async () => {
    await expect(ctx.page.getByTitle('Branche courante')).toContainText('principale')
    await expect(ctx.page.getByTitle(/dépôt\(s\) avec des changements/)).toHaveCount(0)
  })
})
