import { execFile } from 'node:child_process'
import { mkdir, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { expect, test } from '@playwright/test'
import { fermer, lancer, type Contexte, SOCKET_TEST } from './fixtures'

const run = promisify(execFile)

/**
 * Commande avec laquelle chaque session tmux a été lancée.
 *
 * L'amorce fait partie de la création de la session — elle n'est pas tapée dans le
 * terminal — c'est donc tmux, et non l'écran, qui en porte la trace.
 */
async function commandesDeDepart(): Promise<string[]> {
  try {
    const { stdout } = await run('tmux', [
      '-L',
      SOCKET_TEST,
      'list-panes',
      '-a',
      '-F',
      '#{pane_start_command}'
    ])
    return stdout.split('\n').filter(Boolean)
  } catch {
    return []
  }
}

const ligne = (o: unknown): string => `${JSON.stringify(o)}\n`

/** Dossier de transcrits que Claude Code utiliserait pour ce projet. */
function dossierTranscrits(projet: string): string {
  return join(process.env.HOME!, '.claude', 'projects', projet.replace(/[^a-zA-Z0-9-]/g, '-'))
}

/** Reproduit l'arborescence de transcrits de Claude Code pour un projet donné. */
async function semerTranscrits(projet: string): Promise<void> {
  const dossier = dossierTranscrits(projet)
  await mkdir(dossier, { recursive: true })

  await writeFile(
    join(dossier, 'aaaaaaaa-1111-1111-1111-111111111111.jsonl'),
    ligne({ type: 'ai-title', aiTitle: 'Refonte facturation' }) +
      ligne({ type: 'assistant', gitBranch: 'main', timestamp: '2026-08-31T20:06:51.020Z' })
  )
  await writeFile(
    join(dossier, 'bbbbbbbb-2222-2222-2222-222222222222.jsonl'),
    ligne({ type: 'ai-title', aiTitle: 'Migration DTO' })
  )
  // Sans conversation : ne doit jamais apparaître dans la colonne.
  await writeFile(
    join(dossier, 'cccccccc-3333-3333-3333-333333333333.jsonl'),
    ligne({ type: 'bridge-session' })
  )
}

test.describe('sessions Claude Code dans la colonne de gauche', () => {
  let ctx: Contexte

  test.beforeAll(async () => {
    const provisoire = await lancer()
    await semerTranscrits(provisoire.projet)
    await fermer(provisoire, { nettoyer: false })
    ctx = await lancer({ donnees: provisoire.donnees, projet: provisoire.projet })
  })

  test.afterAll(async () => {
    // Les transcrits factices vivent dans le vrai ~/.claude/projects : ne rien y
    // laisser derrière soi.
    await rm(dossierTranscrits(ctx.projet), { recursive: true, force: true })
    await fermer(ctx)
  })

  const colonne = (): ReturnType<Contexte['page']['getByLabel']> =>
    ctx.page.getByLabel('Sessions et fichiers')

  test('les conversations du dossier apparaissent avec leur titre', async () => {
    await expect(colonne().getByText('Refonte facturation')).toBeVisible()
    await expect(colonne().getByText('Migration DTO')).toBeVisible()
  })

  test('les transcrits sans conversation sont écartés', async () => {
    await expect(ctx.page.getByText('cccccccc')).toHaveCount(0)
  })

  test('un clic reprend la conversation dans un nouvel onglet', async () => {
    await colonne().getByText('Refonte facturation').click()
    await expect(ctx.page.locator('.xterm')).toHaveCount(1)

    // L'onglet porte l'identifiant de la conversation : c'est ce lien, que Claude
    // Code ne mémorise pas, qui permettra de la retrouver après un redémarrage.
    const onglets = await ctx.page.evaluate(() => window.claudex.term.list('ws1'))
    expect(onglets[0]?.claudeSessionId).toBe('aaaaaaaa-1111-1111-1111-111111111111')

    // Et la session tmux a bien été lancée sur la commande de reprise.
    await expect
      .poll(async () => (await commandesDeDepart()).join('\n'))
      .toContain('claude -r aaaaaaaa-1111-1111-1111-111111111111')
  })

  test('rouvrir la même conversation bascule sur son onglet au lieu de le dédoubler', async () => {
    await colonne().getByText('Refonte facturation').click()
    await expect(ctx.page.locator('.xterm')).toHaveCount(1)
  })

  test("l'onglet porte le titre de la conversation, pas un libellé générique", async () => {
    // Avec plusieurs agents ouverts, « Agent » partout ne permet pas de s'y
    // retrouver : c'est le titre de la conversation qui sert de repère.
    await expect(ctx.page.getByRole('button', { name: 'Refonte facturation' }).last()).toBeVisible()
  })

  test('le nom de la branche est transmis à Claude Code', async () => {
    // `--name` le donne aussi à Claude Code, qui l'affiche dans son invite et
    // dans son propre sélecteur : le nom vaut alors partout, pas seulement ici.
    const ligne = colonne().locator('li', { hasText: 'Migration DTO' })
    await ligne.hover()
    await ligne.getByTitle(/Bifurquer/).click()
    const dialogue = ctx.page.getByRole('dialog', { name: 'Bifurquer la session' })
    await dialogue.getByLabel('Nom de la branche').fill('essai rapide')
    await dialogue.getByRole('button', { name: 'Bifurquer', exact: true }).click()

    await expect
      .poll(async () => (await commandesDeDepart()).join('\n'))
      .toContain("--name 'Migration DTO -- essai rapide'")
  })

  test('une bifurcation se nomme avant de partir', async () => {
    // Mesuré en écart : ce qui compte est qu'une branche s'ajoute, pas le
    // nombre d'onglets qu'ont laissés les tests précédents.
    const avant = await ctx.page.locator('.xterm').count()
    // Le bouton est cherché DANS la ligne de la conversation : chaque ligne a
    // le sien, et le premier de la colonne appartient à la plus récente.
    const ligneCible = colonne().locator('li', { hasText: 'Refonte facturation' })
    await ligneCible.hover()
    await ligneCible.getByTitle(/Bifurquer/).click()

    // Le nom est demandé au moment où l'intention est claire : sans lui, deux
    // branches d'une même conversation seraient indiscernables.
    const dialogue = ctx.page.getByRole('dialog', { name: 'Bifurquer la session' })
    await expect(dialogue).toBeVisible()
    await dialogue.getByLabel('Nom de la branche').fill('piste sans cache')
    await dialogue.getByRole('button', { name: 'Bifurquer', exact: true }).click()

    // L'onglet porte le nom donné, pas celui de la conversation d'origine.
    await expect
      .poll(async () => {
        const liste = await ctx.page.evaluate(() => window.claudex.term.list('ws1'))
        return liste.at(-1)?.title
      })
      .toBe('Refonte facturation -- piste sans cache')

    await expect(ctx.page.locator('.xterm')).toHaveCount(avant + 1)
    await expect.poll(async () => (await commandesDeDepart()).join('\n')).toContain('--fork-session')

    const onglets = await ctx.page.evaluate(() => window.claudex.term.list('ws1'))
    // L'origine reste en préfixe : la branche se situe sans avoir à la rouvrir.
    expect(onglets.at(-1)?.title).toBe('Refonte facturation -- piste sans cache')
    expect(onglets.at(-1)?.forkedFrom).toBe('aaaaaaaa-1111-1111-1111-111111111111')
  })

  test("annuler le nommage ne bifurque pas", async () => {
    const avant = await ctx.page.locator('.xterm').count()
    const ligne = colonne().locator('li', { hasText: 'Refonte facturation' })
    await ligne.hover()
    await ligne.getByTitle(/Bifurquer/).click()
    await ctx.page.getByRole('button', { name: 'Annuler' }).click()

    await expect(ctx.page.getByRole('dialog')).toHaveCount(0)
    await expect(ctx.page.locator('.xterm')).toHaveCount(avant)
  })
})

test.describe('fermer un onglet', () => {
  let ctx: Contexte

  test.beforeAll(async () => {
    const provisoire = await lancer()
    await semerTranscrits(provisoire.projet)
    await fermer(provisoire, { nettoyer: false })
    ctx = await lancer({ donnees: provisoire.donnees, projet: provisoire.projet })
  })

  test.afterAll(async () => {
    await rm(dossierTranscrits(ctx.projet), { recursive: true, force: true })
    await fermer(ctx)
  })

  test('ne perd pas la conversation', async () => {
    const colonne = ctx.page.getByLabel('Sessions et fichiers')
    await colonne.getByText('Refonte facturation').click()
    await expect(ctx.page.locator('.xterm')).toHaveCount(1)

    // Fermer détruit la session tmux, jamais le transcrit : c'est lui qui porte
    // la conversation, et il vit dans ~/.claude/projects.
    await ctx.page.getByTitle("Fermer l'onglet et sa session tmux").click()
    await expect(ctx.page.locator('.xterm')).toHaveCount(0)

    await expect(colonne.getByText('Refonte facturation')).toBeVisible()

    // Et elle se rouvre avec son contexte.
    await colonne.getByText('Refonte facturation').click()
    await expect(ctx.page.locator('.xterm')).toHaveCount(1)
    const onglets = await ctx.page.evaluate(() => window.claudex.term.list('ws1'))
    expect(onglets.at(-1)?.claudeSessionId).toBe('aaaaaaaa-1111-1111-1111-111111111111')
  })
})

test.describe('étiquette', () => {
  let ctx: Contexte

  test.beforeAll(async () => {
    const provisoire = await lancer()
    await semerTranscrits(provisoire.projet)
    await fermer(provisoire, { nettoyer: false })
    ctx = await lancer({ donnees: provisoire.donnees, projet: provisoire.projet })
  })

  test.afterAll(async () => {
    await rm(dossierTranscrits(ctx.projet), { recursive: true, force: true })
    await fermer(ctx)
  })

  test('distingue deux conversations que leur titre confond', async () => {
    const colonne = ctx.page.getByLabel('Sessions et fichiers')
    const ligne = colonne.locator('li', { hasText: 'Refonte facturation' })

    await ligne.getByRole('button').first().click({ button: 'right' })
    await ctx.page.getByLabel('Étiquette de la conversation').fill('facture v2')
    await ctx.page.keyboard.press('Enter')

    await expect(ligne.getByText('facture v2')).toBeVisible()
  })

  test('survit à un redémarrage de l’application', async () => {
    await fermer(ctx, { nettoyer: false })
    ctx = await lancer({ donnees: ctx.donnees, projet: ctx.projet })

    const ligne = ctx.page
      .getByLabel('Sessions et fichiers')
      .locator('li', { hasText: 'Refonte facturation' })
    await expect(ligne.getByText('facture v2')).toBeVisible()
  })

  test('vider le champ retire l’étiquette', async () => {
    const colonne = ctx.page.getByLabel('Sessions et fichiers')
    const ligne = colonne.locator('li', { hasText: 'Refonte facturation' })

    await ligne.getByRole('button').first().click({ button: 'right' })
    await ctx.page.getByLabel('Étiquette de la conversation').fill('')
    await ctx.page.keyboard.press('Enter')

    await expect(ligne.getByText('facture v2')).toHaveCount(0)
  })
})

test.describe('renommer une conversation', () => {
  let ctx: Contexte

  test.beforeAll(async () => {
    const provisoire = await lancer()
    await semerTranscrits(provisoire.projet)
    await fermer(provisoire, { nettoyer: false })
    ctx = await lancer({ donnees: provisoire.donnees, projet: provisoire.projet })
  })

  test.afterAll(async () => {
    await rm(dossierTranscrits(ctx.projet), { recursive: true, force: true })
    await fermer(ctx)
  })

  const colonne = (): ReturnType<Contexte['page']['getByLabel']> =>
    ctx.page.getByLabel('Sessions et fichiers')

  test('le double-clic met le nom en édition', async () => {
    const ligne = colonne().locator('li', { hasText: 'Refonte facturation' })
    await ligne.getByRole('button').first().dblclick()

    const champ = ctx.page.getByLabel('Nom de la conversation')
    await expect(champ).toBeVisible()
    await champ.fill('Facturation V2')
    await ctx.page.keyboard.press('Enter')

    await expect(colonne().getByText('Facturation V2')).toBeVisible()
    await expect(colonne().getByText('Refonte facturation')).toHaveCount(0)
  })

  test('le nom donné survit à un redémarrage', async () => {
    await fermer(ctx, { nettoyer: false })
    ctx = await lancer({ donnees: ctx.donnees, projet: ctx.projet })
    await expect(colonne().getByText('Facturation V2')).toBeVisible()
  })

  test('vider le champ rend son nom d’origine à la conversation', async () => {
    const ligne = colonne().locator('li', { hasText: 'Facturation V2' })
    await ligne.getByRole('button').first().dblclick()
    await ctx.page.getByLabel('Nom de la conversation').fill('')
    await ctx.page.keyboard.press('Enter')

    // Le titre généré par Claude Code reprend sa place.
    await expect(colonne().getByText('Refonte facturation')).toBeVisible()
  })

  test('Échap laisse le nom intact', async () => {
    const ligne = colonne().locator('li', { hasText: 'Refonte facturation' })
    await ligne.getByRole('button').first().dblclick()
    await ctx.page.getByLabel('Nom de la conversation').fill('jamais validé')
    await ctx.page.keyboard.press('Escape')

    await expect(colonne().getByText('Refonte facturation')).toBeVisible()
    await expect(colonne().getByText('jamais validé')).toHaveCount(0)
  })
})
