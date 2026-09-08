import { execFile } from 'node:child_process'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'
import { promisify } from 'node:util'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { chantier, commiter, DECLARATION, depots, etat, pousser } from '../src/main/services/git'

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

    expect((await depots(projet)).racines.map((c) => basename(c))).toEqual(['coeur', 'passerelle'])
  })

  it('s’arrête au projet quand c’est lui le dépôt', async () => {
    // La forme de Claudex : un dépôt qui contient d'autres dossiers. Descendre
    // y chercher des sous-dépôts n'aurait aucun sens.
    const projet = join(racine, 'seul')
    await depot(projet)
    await mkdir(join(projet, 'sous'), { recursive: true })
    await depot(join(projet, 'sous', 'imbrique'))

    expect((await depots(projet)).racines).toEqual([projet])
  })

  it('ne descend pas dans les dépendances', async () => {
    // Des dépendances traînent parfois un `.git`. La recherche s'arrête au
    // premier niveau, ce qui les écarte sans avoir à les nommer.
    const projet = join(racine, 'avec-deps')
    await depot(join(projet, 'app'))
    await depot(join(projet, 'app', 'node_modules', 'un-paquet'))

    expect((await depots(projet)).racines.map((c) => basename(c))).toEqual(['app'])
  })

  it('ne trouve rien dans un dossier sans dépôt, ce qui n’est pas une erreur', async () => {
    const projet = join(racine, 'sans')
    await mkdir(join(projet, 'quelconque'), { recursive: true })

    expect((await depots(projet)).racines).toEqual([])
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

describe('écrire dans les dépôts', () => {
  let racine: string

  beforeAll(async () => {
    racine = await mkdtemp(join(tmpdir(), 'claudex-git-ecrit-'))
  })

  afterAll(async () => {
    await rm(racine, { recursive: true, force: true })
  })

  /** Le journal d'un dépôt, en une ligne par commit. */
  async function journal(chemin: string): Promise<string[]> {
    const { stdout } = await run('git', ['-C', chemin, 'log', '--format=%s'])
    return stdout.split('\n').filter(Boolean)
  }

  it('indexe et commite les seuls fichiers demandés', async () => {
    const projet = join(racine, 'choix')
    await depot(projet)
    await writeFile(join(projet, 'pris.txt'), 'oui\n')
    await writeFile(join(projet, 'laisse.txt'), 'non\n')

    const compte = await commiter(projet, ['pris.txt'], 'feat: le fichier choisi')
    expect(compte.fait).toBe(true)
    expect(await journal(projet)).toEqual(['feat: le fichier choisi', 'base'])

    // Ce qui n'était pas coché est resté sur le côté.
    const reste = await etat(projet)
    expect(reste?.depots[0]?.fichiers.map((f) => f.chemin)).toEqual(['laisse.txt'])
  })

  it('refuse de commiter par-dessus une fusion en cours', async () => {
    // Commiter au milieu d'une fusion non résolue la clôt avec les marqueurs de
    // conflit dans le code. Git ne le dit qu'au moment où il refuse.
    const projet = join(racine, 'fusion')
    await depot(projet, 'principale')
    await run('git', ['-C', projet, 'checkout', '-q', '-b', 'autre'])
    await writeFile(join(projet, 'base.txt'), 'autre\n')
    await run('git', ['-C', projet, 'commit', '-qam', 'côté autre'])
    await run('git', ['-C', projet, 'checkout', '-q', 'principale'])
    await writeFile(join(projet, 'base.txt'), 'principale\n')
    await run('git', ['-C', projet, 'commit', '-qam', 'côté principale'])
    await run('git', ['-C', projet, 'merge', 'autre']).catch(() => undefined)

    expect(await chantier(projet)).toBe('fusion')
    const compte = await commiter(projet, ['base.txt'], 'quand même')
    expect(compte.fait).toBe(false)
    expect(compte.message).toContain('fusion')
    expect(await journal(projet)).not.toContain('quand même')
  })

  it('rapporte ce que dit un hook qui refuse', async () => {
    // Un `pre-commit` explique son refus dans sa propre sortie. C'est cette
    // explication qui sert à corriger : la réduire à « échec » la perdrait.
    const projet = join(racine, 'hook')
    await depot(projet)
    const hooks = join(projet, '.git', 'hooks')
    await mkdir(hooks, { recursive: true })
    await writeFile(join(hooks, 'pre-commit'), '#!/bin/sh\necho "la mise en forme cloche"\nexit 1\n', {
      mode: 0o755
    })
    await writeFile(join(projet, 'base.txt'), 'deux\n')

    const compte = await commiter(projet, ['base.txt'], 'refusé')
    expect(compte.fait).toBe(false)
    expect(compte.message).toContain('la mise en forme cloche')
  })

  it('ne pousse pas une branche sans amont, et le dit', async () => {
    // Le cas de `deploy`. Sans amont, git demanderait où pousser ; inventer une
    // destination serait pire que de le dire.
    const projet = join(racine, 'sans-amont')
    await depot(projet, 'master')

    const compte = await pousser(projet)
    expect(compte.fait).toBe(false)
    expect(compte.message).toContain('amont')
  })

  it('ne commite rien quand aucun fichier n’est choisi', async () => {
    const projet = join(racine, 'vide')
    await depot(projet)
    await writeFile(join(projet, 'base.txt'), 'deux\n')

    expect((await commiter(projet, [], 'sans rien')).fait).toBe(false)
    expect(await journal(projet)).toEqual(['base'])
  })
})

describe('déclaration des dépôts à suivre', () => {
  let racine: string

  beforeAll(async () => {
    racine = await mkdtemp(join(tmpdir(), 'claudex-git-declare-'))
  })

  afterAll(async () => {
    await rm(racine, { recursive: true, force: true })
  })

  /** Écrit `.claudex/git.yml` dans un projet. */
  async function declarer(projet: string, contenu: string): Promise<void> {
    await mkdir(join(projet, '.claudex'), { recursive: true })
    await writeFile(join(projet, DECLARATION), contenu)
  }

  it('ne suit que ce qui est déclaré', async () => {
    // Seize dépôts dont on n'en travaille que deux : la page n'a pas à porter
    // les quatorze autres.
    const projet = join(racine, 'choisis')
    await depot(join(projet, 'un'))
    await depot(join(projet, 'deux'))
    await depot(join(projet, 'trois'))
    await declarer(projet, 'depots:\n  - un\n  - trois\n')

    const { racines, reproches } = await depots(projet)
    expect(racines.map((c) => basename(c))).toEqual(['un', 'trois'])
    expect(reproches).toEqual([])
  })

  it('va chercher un dépôt que la recherche à un niveau ne trouve pas', async () => {
    const projet = join(racine, 'profond')
    await mkdir(join(projet, 'sous'), { recursive: true })
    await depot(join(projet, 'sous', 'cache'))
    await declarer(projet, 'depots:\n  - sous/cache\n')

    expect((await depots(projet)).racines.map((c) => basename(c))).toEqual(['cache'])
  })

  it('suit un dépôt rangé à côté du projet', async () => {
    // La forme d'olive_services et web_clients, qui sont voisins.
    const voisin = join(racine, 'voisin')
    await depot(voisin)
    const projet = join(racine, 'depuis-ailleurs')
    await mkdir(projet, { recursive: true })
    await declarer(projet, 'depots:\n  - ../voisin\n')

    expect((await depots(projet)).racines.map((c) => basename(c))).toEqual(['voisin'])
  })

  it('dit ce qui ne mène à aucun dépôt, sans perdre le reste', async () => {
    // Une faute de frappe laisserait sinon la page silencieusement incomplète.
    const projet = join(racine, 'fautes')
    await depot(join(projet, 'bon'))
    await mkdir(join(projet, 'simple-dossier'), { recursive: true })
    await declarer(projet, 'depots:\n  - bon\n  - absent\n  - simple-dossier\n')

    const { racines, reproches } = await depots(projet)
    expect(racines.map((c) => basename(c))).toEqual(['bon'])
    expect(reproches.map((r) => r.chemin)).toEqual(['absent', 'simple-dossier'])
    expect(reproches[0]?.message).toContain('introuvable')
    expect(reproches[1]?.message).toContain('pas un dépôt')
  })

  it('remonte le reproche jusqu’à l’état du projet', async () => {
    const projet = join(racine, 'remonte')
    await depot(join(projet, 'bon'))
    await declarer(projet, 'depots:\n  - bon\n  - absent\n')

    const vu = await etat(projet)
    expect(vu?.depots.map((d) => d.nom)).toEqual(['bon'])
    expect(vu?.reproches).toHaveLength(1)
  })

  it('revient à la recherche quand le fichier ne parle pas des dépôts', async () => {
    // Un fichier qui existe sans nommer de dépôt ne doit pas tout éteindre.
    const projet = join(racine, 'muet')
    await depot(join(projet, 'un'))
    await declarer(projet, 'autre_chose: oui\n')

    expect((await depots(projet)).racines.map((c) => basename(c))).toEqual(['un'])
  })

  it('dit ce qu’il ne sait pas lire, plutôt que de se taire', async () => {
    const projet = join(racine, 'illisible')
    await depot(join(projet, 'un'))
    await declarer(projet, 'depots: [un\n')

    const { racines, reproches } = await depots(projet)
    expect(racines).toEqual([])
    expect(reproches[0]?.message).toContain('ne se lit pas')
  })
})
