import { execFile } from 'node:child_process'
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { expect, test, type Locator } from '@playwright/test'
import { fermer, lancer, nouveauTerminal, type Contexte } from './fixtures'

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

/**
 * La page Git de la colonne, où l'on choisit ce qui partira au commit.
 */
test.describe('page Git', () => {
  let ctx: Contexte

  test.beforeAll(async () => {
    const projet = await mkdtemp(join(tmpdir(), 'claudex-page-git-'))
    await depot(join(projet, 'coeur'), 'local')
    await depot(join(projet, 'passerelle'), 'master')
    await depot(join(projet, 'repos'), 'local')

    await writeFile(join(projet, 'coeur', 'base.txt'), 'deux\n')
    await mkdir(join(projet, 'coeur', 'src'), { recursive: true })
    await writeFile(join(projet, 'coeur', 'src', 'Lien.java'), 'class Lien {}\n')
    await writeFile(join(projet, 'passerelle', 'neuf.txt'), 'neuf\n')

    ctx = await lancer({ projet })
    await ctx.page.getByRole('button', { name: 'Git', exact: true }).click()
  })

  test.afterAll(async () => {
    await fermer(ctx)
  })

  test('sépare ce qui est suivi de ce que git n’a jamais vu', async () => {
    // Un fichier suivi qu'on a modifié et un fichier neuf n'engagent pas au
    // même geste : on commite le premier sans y penser, le second demande
    // qu'on ait décidé qu'il entre dans le dépôt.
    const changements = ctx.page.getByLabel('Changements')
    const neufs = ctx.page.getByLabel('Fichiers non versionnés')

    await expect(changements.getByRole('button', { name: /^coeur/ })).toBeVisible()
    await expect(changements.getByRole('button', { name: /^passerelle/ })).toHaveCount(0)

    // Le même dépôt paraît dans les deux quand il porte des deux sortes.
    await expect(neufs.getByRole('button', { name: /^coeur/ })).toBeVisible()
    await expect(neufs.getByRole('button', { name: /^passerelle/ })).toBeVisible()
  })

  test('range les fichiers sous leur dépôt, avec sa branche', async () => {
    const coeur = ctx.page.getByLabel('Changements').getByRole('button', { name: /^coeur/ })
    await expect(coeur).toContainText('local')
    await expect(coeur).toContainText('1')

    await expect(
      ctx.page.getByLabel('Fichiers non versionnés').getByRole('button', { name: /^passerelle/ })
    ).toContainText('master')
    // Un dépôt sans rien n'encombre aucune des deux sections.
    await expect(ctx.page.getByRole('button', { name: /^repos/ })).toHaveCount(0)
  })

  test('donne au nom la couleur de son état', async () => {
    // Le code d'IntelliJ : bleu pour ce qui est suivi et modifié, rouge pour ce
    // que git n'a jamais vu. Cela se voit à la volée, là où une lettre demande
    // de la connaître.
    const teinte = (cible: Locator): Promise<string> =>
      cible.evaluate((el) => getComputedStyle(el).color)

    const modifie = ctx.page.getByLabel('Changements').getByLabel('modifié').first()
    const neuf = ctx.page.getByLabel('Fichiers non versionnés').getByLabel('non suivi').first()
    await expect(modifie).toHaveText('base.txt')

    // Les valeurs du thème : --color-info et --color-erreur.
    expect(await teinte(modifie)).toBe('rgb(127, 168, 214)')
    expect(await teinte(neuf)).toBe('rgb(224, 104, 95)')
  })

  test('montre le dossier d’un fichier autant que son nom', async () => {
    // Dix `index.ts` dans un même dépôt ne se distinguent que par leur dossier.
    const ligne = ctx.page.getByTitle('Voir le diff de src/Lien.java')
    await expect(ligne).toContainText('Lien.java')
    await expect(ligne).toContainText('src')
  })

  test('un dépôt se replie et cache ses fichiers sans les décocher', async () => {
    const coeur = ctx.page.getByLabel('Changements').getByRole('button', { name: /^coeur/ })
    const fichier = ctx.page.getByRole('checkbox', { name: 'base.txt' })

    await fichier.click()
    await expect(fichier).toHaveAttribute('aria-checked', 'true')

    await coeur.click()
    await expect(coeur).toHaveAttribute('aria-expanded', 'false')
    await expect(fichier).toBeHidden()

    await coeur.click()
    await expect(fichier).toHaveAttribute('aria-checked', 'true')
  })

  test('la case d’une section coche et décoche tout ce qu’elle porte', async () => {
    const neufs = ctx.page.getByLabel('Fichiers non versionnés')
    const tout = ctx.page.getByRole('checkbox', {
      name: 'Tout cocher dans Fichiers non versionnés'
    })
    const lien = neufs.getByRole('checkbox', { name: 'src/Lien.java' })
    const nouveau = neufs.getByRole('checkbox', { name: 'neuf.txt' })

    await tout.click()
    await expect(lien).toHaveAttribute('aria-checked', 'true')
    await expect(nouveau).toHaveAttribute('aria-checked', 'true')
    await expect(tout).toHaveAttribute('aria-checked', 'true')

    // Décocher un seul fichier laisse la section dans l'entre-deux.
    await lien.click()
    await expect(tout).toHaveAttribute('aria-checked', 'mixed')

    await tout.click()
    await expect(lien).toHaveAttribute('aria-checked', 'true')
    await tout.click()
    await expect(lien).toHaveAttribute('aria-checked', 'false')
  })

  test('le filtre porte sur le chemin, et écarte les dépôts vides', async () => {
    await ctx.page.getByLabel('Filtrer').fill('Lien')
    await expect(ctx.page.getByRole('button', { name: /^coeur/ })).toBeVisible()
    await expect(ctx.page.getByRole('button', { name: /^passerelle/ })).toHaveCount(0)

    await ctx.page.getByLabel('Filtrer').fill('')
    await expect(ctx.page.getByRole('button', { name: /^passerelle/ })).toBeVisible()
  })
})

test.describe('page Git sans dépôt', () => {
  let ctx: Contexte

  test.beforeAll(async () => {
    ctx = await lancer()
    await ctx.page.getByRole('button', { name: 'Git', exact: true }).click()
  })

  test.afterAll(async () => {
    await fermer(ctx)
  })

  test('le dit en une phrase, sans afficher d’erreur', async () => {
    await expect(ctx.page.getByText('Ce projet ne contient aucun dépôt git.')).toBeVisible()
  })
})

/**
 * La vue de diff, ouverte depuis la page Git. C'est la seconde sorte de vue :
 * la première, le journal d'un service, passe par le même mécanisme.
 */
test.describe('vue de diff', () => {
  let ctx: Contexte

  test.beforeAll(async () => {
    const projet = await mkdtemp(join(tmpdir(), 'claudex-diff-'))
    await depot(projet, 'local')
    await writeFile(
      join(projet, 'base.txt'),
      'un\ndeux\ntrois\nquatre\ncinq\nsix\nsept\n'
    )
    await run('git', ['-C', projet, 'add', '-A'])
    await run('git', ['-C', projet, 'commit', '-qm', 'sept lignes'])

    await writeFile(
      join(projet, 'base.txt'),
      'un\ndeux MODIFIE\ntrois\nquatre\ncinq\nsix\nsept\n'
    )
    await writeFile(join(projet, 'neuf.txt'), 'tout neuf\n')

    // Deux cents lignes changées : de quoi dépasser la fenêtre.
    const corps = (marque: string): string =>
      Array.from({ length: 200 }, (_, n) => `ligne ${n} ${marque}`).join('\n') + '\n'
    await writeFile(join(projet, 'long.txt'), corps('avant'))
    await run('git', ['-C', projet, 'add', 'long.txt'])
    await run('git', ['-C', projet, 'commit', '-qm', 'long'])
    await writeFile(join(projet, 'long.txt'), corps('après'))

    // Une ligne bien plus large que la colonne, comme un fichier minifié.
    await writeFile(join(projet, 'large.txt'), 'court\n')
    await run('git', ['-C', projet, 'add', 'large.txt'])
    await run('git', ['-C', projet, 'commit', '-qm', 'large'])
    await writeFile(join(projet, 'large.txt'), `${'x'.repeat(600)}\n`)
    // Un binaire, que git renonce à comparer ligne à ligne.
    await writeFile(join(projet, 'image.bin'), Buffer.from([0, 1, 2, 0, 255, 0, 3]))
    await run('git', ['-C', projet, 'add', 'image.bin'])
    await run('git', ['-C', projet, 'commit', '-qm', 'binaire'])
    await writeFile(join(projet, 'image.bin'), Buffer.from([0, 9, 9, 0, 128, 0, 7]))

    ctx = await lancer({ projet })
    await ctx.page.getByRole('button', { name: 'Git', exact: true }).click()
  })

  test.afterAll(async () => {
    await fermer(ctx)
  })

  test('un clic sur un fichier montre son diff à la place du terminal', async () => {
    await nouveauTerminal(ctx.page)
    await expect(ctx.page.locator('.xterm')).toHaveCount(1)

    await ctx.page.getByRole('button', { name: 'Git', exact: true }).click()
    await ctx.page.getByTitle('Voir le diff de base.txt').click()

    // La ligne d'avant et celle d'après, chacune de son côté.
    await expect(ctx.page.getByText('deux', { exact: true })).toBeVisible()
    await expect(ctx.page.getByText('deux MODIFIE', { exact: true })).toBeVisible()
    await expect(ctx.page.getByText('+1 −1')).toBeVisible()
    await expect(ctx.page.getByText('travail → index')).toBeVisible()

    // La vue se ferme et rend l'écran au terminal, qui n'a pas bougé.
    await ctx.page.getByTitle('Fermer la vue. Le fichier reste sur le disque.').click()
    await expect(ctx.page.locator('.xterm')).toHaveCount(1)
  })

  test('la forme se bascule et se retient d’un fichier à l’autre', async () => {
    await ctx.page.getByTitle('Voir le diff de base.txt').click()
    const forme = ctx.page.getByRole('button', { name: /côte à côte|unifié/ })
    await expect(forme).toHaveText('côte à côte')

    await forme.click()
    await expect(forme).toHaveText('unifié')

    // Un autre fichier garde la forme choisie : on ne la rechoisit pas à chaque
    // ouverture.
    await ctx.page.getByTitle('Fermer la vue. Le fichier reste sur le disque.').click()
    await ctx.page.getByTitle('Voir le diff de neuf.txt').click()
    await expect(ctx.page.getByRole('button', { name: /côte à côte|unifié/ })).toHaveText('unifié')
  })

  test('un fichier que git ne suit pas encore se montre entier', async () => {
    await ctx.page.getByTitle('Voir le diff de neuf.txt').click()
    // `git diff` seul n'en dirait rien : il n'a pas d'ancien côté.
    await expect(ctx.page.getByText('fichier neuf')).toBeVisible()
    await expect(ctx.page.getByText('tout neuf', { exact: true })).toBeVisible()
  })

  test('un long diff défile', async () => {
    // Deux cents lignes changées tiennent plus que la fenêtre. Sans hauteur
    // bornée quelque part dans la chaîne, la vue pousse la fenêtre au lieu de
    // défiler, et le bas devient inatteignable.
    await ctx.page.getByTitle(/voir le diff de long\.txt/).click()

    const zone = ctx.page.getByLabel('Contenu du diff')
    // Le diff se lit derrière : mesurer avant qu'il n'arrive ne dirait rien.
    await expect(zone.locator('tr').first()).toBeVisible()

    const mesures = await zone.evaluate((el) => ({
      contenu: el.scrollHeight,
      visible: el.clientHeight
    }))
    expect(mesures.contenu).toBeGreaterThan(mesures.visible)

    // Et il défile réellement, jusqu'en bas.
    await zone.evaluate((el) => el.scrollTo(0, el.scrollHeight))
    expect(await zone.evaluate((el) => el.scrollTop)).toBeGreaterThan(0)
  })

  test('une ligne trop longue reste atteignable', async () => {
    // En côte à côte, les cellules coupaient ce qui dépassait, sans que rien ne
    // permette d'aller le voir. Une ligne minifiée ou un long littéral se
    // perdait au-delà du bord.
    await ctx.page.getByTitle(/voir le diff de large\.txt/).click()
    const zone = ctx.page.getByLabel('Contenu du diff')
    await expect(zone.locator('tr').first()).toBeVisible()

    const mesures = await zone.evaluate((el) => ({
      contenu: el.scrollWidth,
      visible: el.clientWidth
    }))
    expect(mesures.contenu).toBeGreaterThan(mesures.visible)

    // Le même défaut valait pour le mode d'un seul tenant : la mesure vaut donc
    // pour les deux formes.
    await ctx.page.getByRole('button', { name: /côte à côte|unifié/ }).click()
    const unifie = await zone.evaluate((el) => ({
      contenu: el.scrollWidth,
      visible: el.clientWidth
    }))
    expect(unifie.contenu).toBeGreaterThan(unifie.visible)
    await ctx.page.getByRole('button', { name: /côte à côte|unifié/ }).click()
  })

  test('un binaire le dit, plutôt que de rester vide', async () => {
    await ctx.page.getByTitle('Voir le diff de image.bin').click()
    await expect(
      ctx.page.getByText('Fichier binaire. Git ne le compare pas ligne à ligne.')
    ).toBeVisible()
  })
})

/**
 * Le commit, sur plusieurs dépôts à la fois. C'est le geste que la page vise :
 * cocher dans trois dépôts et commiter écrit trois commits.
 */
test.describe('commiter depuis la page Git', () => {
  let ctx: Contexte
  let projet: string

  /** Les sujets des commits d'un dépôt, du plus récent au plus ancien. */
  const journal = async (nom: string): Promise<string[]> => {
    const { stdout } = await run('git', ['-C', join(projet, nom), 'log', '--format=%s'])
    return stdout.split('\n').filter(Boolean)
  }

  test.beforeAll(async () => {
    projet = await mkdtemp(join(tmpdir(), 'claudex-commit-'))
    await depot(join(projet, 'coeur'), 'local')
    await depot(join(projet, 'passerelle'), 'local')
    await depot(join(projet, 'rebelle'), 'local')

    await writeFile(join(projet, 'coeur', 'base.txt'), 'deux\n')
    await writeFile(join(projet, 'passerelle', 'base.txt'), 'trois\n')
    await writeFile(join(projet, 'rebelle', 'base.txt'), 'quatre\n')

    // Un dépôt dont le hook refuse : l'échec est partiel par nature, et c'est
    // le cas qu'il faut voir rendu.
    const hooks = join(projet, 'rebelle', '.git', 'hooks')
    await mkdir(hooks, { recursive: true })
    await writeFile(join(hooks, 'pre-commit'), '#!/bin/sh\necho "je refuse"\nexit 1\n', {
      mode: 0o755
    })

    ctx = await lancer({ projet })
    await ctx.page.getByRole('button', { name: 'Git', exact: true }).click()
  })

  test.afterAll(async () => {
    await fermer(ctx)
  })

  test('écrit un commit par dépôt, et rend compte de celui qui refuse', async () => {
    for (const nom of ['coeur', 'passerelle', 'rebelle']) {
      await ctx.page.getByRole('checkbox', { name: `Tout cocher dans ${nom}` }).click()
    }
    await expect(ctx.page.getByText('3 fichiers · 3 dépôts')).toBeVisible()

    await ctx.page.getByLabel('Message du commit').fill('feat: le même message partout')
    await ctx.page.getByRole('button', { name: 'Commiter', exact: true }).click()

    const rendu = ctx.page.getByLabel('Compte rendu du commit')
    await expect(rendu).toContainText('je refuse')

    // Deux dépôts ont commité, le troisième non. Le journal fait foi.
    expect(await journal('coeur')).toEqual(['feat: le même message partout', 'base'])
    expect(await journal('passerelle')).toEqual(['feat: le même message partout', 'base'])
    expect(await journal('rebelle')).toEqual(['base'])
  })

  test('laisse coché ce qui a échoué, et décoche ce qui est parti', async () => {
    // On recommence sans avoir à retrouver ses fichiers.
    await expect(ctx.page.getByRole('checkbox', { name: 'Tout cocher dans rebelle' })).toHaveAttribute(
      'aria-checked',
      'true'
    )
    await expect(ctx.page.getByText('1 fichier · 1 dépôt')).toBeVisible()

    // Les deux dépôts commités ont disparu de la liste : ils n'ont plus rien.
    await expect(ctx.page.getByRole('button', { name: /^coeur/ })).toHaveCount(0)
  })

  test('tient les deux gestes sur une seule ligne', async () => {
    // La mesure de ce qui est coché partageait la ligne des boutons et prenait
    // la largeur qui manquait au second, dont l'intitulé passait à deux lignes.
    const commiter = await ctx.page.getByRole('button', { name: 'Commiter', exact: true }).boundingBox()
    const pousser = await ctx.page
      .getByRole('button', { name: 'Commiter et pousser' })
      .boundingBox()

    expect(commiter).not.toBeNull()
    expect(pousser).not.toBeNull()
    // Côte à côte et à la même hauteur. Le pixel d'écart vient de la bordure du
    // second bouton, que le premier n'a pas.
    expect(Math.abs(pousser!.y - commiter!.y)).toBeLessThanOrEqual(2)
    expect(Math.abs(pousser!.height - commiter!.height)).toBeLessThanOrEqual(2)
    expect(pousser!.x).toBeGreaterThan(commiter!.x)

    // Une seule ligne de texte dans chacun : à deux lignes, le bouton ferait le
    // double de haut.
    expect(pousser!.height).toBeLessThan(34)
  })

  test('ne commite pas sans message', async () => {
    await ctx.page.getByLabel('Message du commit').fill('')
    await expect(ctx.page.getByRole('button', { name: 'Commiter', exact: true })).toBeDisabled()
  })
})

/**
 * Changer de projet doit relire l'état git, comme il relit tout le reste.
 */
test.describe('changement de projet', () => {
  let ctx: Contexte

  test.beforeAll(async () => {
    const donnees = await mkdtemp(join(tmpdir(), 'claudex-bascule-'))
    const nu = await mkdtemp(join(tmpdir(), 'claudex-nu-'))
    const versionne = await mkdtemp(join(tmpdir(), 'claudex-versionne-'))
    await depot(versionne, 'local')
    await writeFile(join(versionne, 'base.txt'), 'deux\n')

    // Deux projets dans le profil : le premier sans dépôt, le second avec.
    await writeFile(
      join(donnees, 'state.json'),
      JSON.stringify({
        workspaces: [
          { id: 'ws1', path: nu, name: 'Sans dépôt', color: '#e8825a', order: 0, expanded: true },
          { id: 'ws2', path: versionne, name: 'Avec dépôt', color: '#7fa8d6', order: 1, expanded: true }
        ],
        tabs: [],
        layout: { leftWidth: 260, middleWidth: 300 },
        activeWorkspaceId: 'ws1'
      })
    )

    ctx = await lancer({ donnees, projet: nu })
  })

  test.afterAll(async () => {
    await fermer(ctx)
  })

  test('relit l’état git sans qu’on ait à le demander', async () => {
    await ctx.page.getByRole('button', { name: 'Git', exact: true }).click()
    await expect(ctx.page.getByText('Ce projet ne contient aucun dépôt git.')).toBeVisible()

    // Le passage vidait l'état sans le relire : la page restait sur « Lecture… »
    // jusqu'au battement de quinze secondes de la bande du haut.
    await ctx.page.getByLabel('Projets').getByText('Avec dépôt').click()
    await expect(ctx.page.getByRole('button', { name: /^claudex-versionne/ })).toBeVisible({
      timeout: 5000
    })
    await expect(ctx.page.getByText('Lecture…')).toHaveCount(0)
  })
})

/**
 * L'indentation de la page Git est celle de l'arbre des fichiers.
 *
 * Deux arbres côte à côte dans la même colonne, à deux crans différents, se
 * liraient comme deux applications.
 */
test.describe('imbrication de la page Git', () => {
  let ctx: Contexte

  test.beforeAll(async () => {
    const projet = await mkdtemp(join(tmpdir(), 'claudex-crans-'))
    await depot(projet, 'local')
    await mkdir(join(projet, 'src'), { recursive: true })
    await writeFile(join(projet, 'src', 'Lien.java'), 'class Lien {}\n')
    await run('git', ['-C', projet, 'add', '-A'])
    await run('git', ['-C', projet, 'commit', '-qm', 'source'])
    await writeFile(join(projet, 'src', 'Lien.java'), 'class Lien { int x; }\n')

    ctx = await lancer({ projet })
  })

  test.afterAll(async () => {
    await fermer(ctx)
  })

  /** L'abscisse d'un élément à l'écran. */
  const abscisse = async (cible: Locator): Promise<number> => {
    const cadre = await cible.boundingBox()
    expect(cadre).not.toBeNull()
    return cadre!.x
  }

  test('descend d’un cran de la même largeur que l’arbre des fichiers', async () => {
    // L'arbre donne la mesure : un dossier et le fichier qu'il porte.
    await ctx.page.getByRole('button', { name: 'Fichiers', exact: true }).click()
    await ctx.page.getByTitle(join(ctx.projet, 'src')).click()
    const dossier = await abscisse(ctx.page.getByText('src', { exact: true }))
    const dedans = await abscisse(
      ctx.page.getByTitle(join(ctx.projet, 'src', 'Lien.java')).getByText('Lien.java')
    )
    const cran = dedans - dossier
    expect(cran).toBeGreaterThan(0)

    // La page Git suit le même cran. Les cases à cocher sont les points
    // homologues : le premier élément de chaque ligne après ses traits.
    await ctx.page.getByRole('button', { name: 'Git', exact: true }).click()
    const caseDepot = ctx.page.getByRole('checkbox', { name: /^Tout cocher dans claudex-/ })
    const caseFichier = ctx.page.getByRole('checkbox', { name: 'src/Lien.java' })
    expect((await abscisse(caseFichier)) - (await abscisse(caseDepot))).toBeCloseTo(cran, 0)
  })

  test('peint la ligne d’un fichier d’un bord à l’autre', async () => {
    // Le décalage est posé dans la ligne et non en marge du conteneur : mis en
    // marge, la zone d'indentation sortirait du survol, et la ligne d'un
    // fichier ne se peindrait plus jusqu'au bord.
    const section = ctx.page
      .getByRole('checkbox', { name: 'Tout cocher dans Changements' })
      .locator('xpath=..')
    const fichier = ctx.page.getByTitle('Voir le diff de src/Lien.java').locator('xpath=..')

    expect(await abscisse(fichier)).toBeCloseTo(await abscisse(section), 0)
  })
})
