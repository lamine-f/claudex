import { execFile } from 'node:child_process'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'
import { promisify } from 'node:util'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { depots, etat } from '../src/main/services/git'

const run = promisify(execFile)

/**
 * Un dépôt neuf, avec un premier commit.
 *
 * Sans commit, `git status` répond que la branche n'existe pas encore, ce qui
 * est un cas à part et non celui qu'on veut mesurer ici.
 */
async function depot(chemin: string, branche = 'main'): Promise<void> {
  await mkdir(chemin, { recursive: true })
  await run('git', ['-C', chemin, 'init', '-q', '-b', branche])
  await run('git', ['-C', chemin, 'config', 'user.email', 'essai@claudex'])
  await run('git', ['-C', chemin, 'config', 'user.name', 'Essai'])
  await writeFile(join(chemin, 'base.txt'), 'un\n')
  await run('git', ['-C', chemin, 'add', '-A'])
  await run('git', ['-C', chemin, 'commit', '-qm', 'base'])
}

describe('détection des dépôts d’un projet', () => {
  let racine: string

  beforeAll(async () => {
    racine = await mkdtemp(join(tmpdir(), 'claudex-git-'))
  })

  afterAll(async () => {
    await rm(racine, { recursive: true, force: true })
  })

  it('trouve les dépôts rangés sous un dossier qui n’en est pas un', async () => {
    // La forme d'olive_services : le projet n'est pas un dépôt, il en contient
    // seize. C'est le cas nominal, pas une extension.
    const projet = join(racine, 'services')
    await depot(join(projet, 'coeur'))
    await depot(join(projet, 'passerelle'))
    await mkdir(join(projet, 'notes'), { recursive: true })

    expect((await depots(projet)).map((c) => basename(c))).toEqual(['coeur', 'passerelle'])
  })

  it('s’arrête au projet quand c’est lui le dépôt', async () => {
    // La forme de Claudex : un dépôt qui contient d'autres dossiers. Descendre
    // y chercher des sous-dépôts n'aurait aucun sens.
    const projet = join(racine, 'seul')
    await depot(projet)
    await mkdir(join(projet, 'sous'), { recursive: true })
    await depot(join(projet, 'sous', 'imbrique'))

    expect(await depots(projet)).toEqual([projet])
  })

  it('ne descend pas dans les dépendances', async () => {
    // Des dépendances traînent parfois un `.git`. La recherche s'arrête au
    // premier niveau, ce qui les écarte sans avoir à les nommer.
    const projet = join(racine, 'avec-deps')
    await depot(join(projet, 'app'))
    await depot(join(projet, 'app', 'node_modules', 'un-paquet'))

    expect((await depots(projet)).map((c) => basename(c))).toEqual(['app'])
  })

  it('ne trouve rien dans un dossier sans dépôt, ce qui n’est pas une erreur', async () => {
    const projet = join(racine, 'sans')
    await mkdir(join(projet, 'quelconque'), { recursive: true })

    expect(await depots(projet)).toEqual([])
    expect(await etat(projet)).toBeNull()
  })
})

describe('état agrégé d’un projet', () => {
  let racine: string

  beforeAll(async () => {
    racine = await mkdtemp(join(tmpdir(), 'claudex-git-etat-'))
  })

  afterAll(async () => {
    await rm(racine, { recursive: true, force: true })
  })

  it('additionne ce que portent les dépôts, et tait la branche quand ils divergent', async () => {
    const projet = join(racine, 'services')
    await depot(join(projet, 'coeur'), 'local')
    await depot(join(projet, 'passerelle'), 'master')

    await writeFile(join(projet, 'coeur', 'base.txt'), 'deux\n')
    await writeFile(join(projet, 'coeur', 'neuf.txt'), 'neuf\n')
    await writeFile(join(projet, 'passerelle', 'base.txt'), 'trois\n')

    const vu = await etat(projet)
    expect(vu?.depots.map((d) => d.nom)).toEqual(['coeur', 'passerelle'])
    expect(vu?.modifies).toBe(2)
    expect(vu?.nonSuivis).toBe(1)
    // Deux branches distinctes : en annoncer une ferait croire que le projet y
    // est tout entier.
    expect(vu?.branche).toBeUndefined()
  })

  it('annonce la branche quand tous les dépôts s’accordent', async () => {
    const projet = join(racine, 'accord')
    await depot(join(projet, 'un'), 'local')
    await depot(join(projet, 'deux'), 'local')

    expect((await etat(projet))?.branche).toBe('local')
  })

  it('montre les fichiers d’un dossier neuf, et non le dossier', async () => {
    // Sans `-uall`, git replie un dossier entier non suivi en une seule ligne
    // `? src/`. Ce n'est pas un fichier : on ne saurait ni ce qu'il contient,
    // ni quoi cocher pour le commiter.
    const projet = join(racine, 'dossier-neuf')
    await depot(projet)
    await mkdir(join(projet, 'src'), { recursive: true })
    await writeFile(join(projet, 'src', 'Un.java'), 'class Un {}\n')
    await writeFile(join(projet, 'src', 'Deux.java'), 'class Deux {}\n')

    const vu = await etat(projet)
    expect(vu?.depots[0]?.fichiers.map((f) => f.chemin)).toEqual([
      'src/Deux.java',
      'src/Un.java'
    ])
  })

  it('lit un dépôt sans amont sans en faire une erreur', async () => {
    // Le cas de `deploy` : git n'écrit alors ni branch.upstream ni branch.ab.
    const projet = join(racine, 'sans-amont')
    await depot(projet, 'master')

    const vu = await etat(projet)
    expect(vu?.depots[0]).toMatchObject({ branche: 'master', avance: 0, retard: 0 })
    expect(vu?.depots[0]?.amont).toBeUndefined()
  })
})
