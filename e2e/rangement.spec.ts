import { mkdir, rm, utimes, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { expect, test, type Locator, type Page } from '@playwright/test'
import { fermer, lancer, type Contexte } from './fixtures'

const ligneJson = (o: unknown): string => `${JSON.stringify(o)}\n`

function dossierTranscrits(projet: string): string {
  return join(homedir(), '.claude', 'projects', projet.replace(/[^a-zA-Z0-9-]/g, '-'))
}

/** Trois conversations d'âges nettement distincts : Alpha, Beta, Gamma. */
async function semer(projet: string): Promise<void> {
  const dossier = dossierTranscrits(projet)
  await mkdir(dossier, { recursive: true })
  const titres = ['Alpha', 'Beta', 'Gamma']
  const heure = 3_600_000
  for (const [rang, titre] of titres.entries()) {
    const fichier = join(dossier, `${'0123456789abcdef'[rang]!.repeat(8)}-1111-1111-1111-111111111111.jsonl`)
    await writeFile(fichier, ligneJson({ type: 'ai-title', aiTitle: titre }))
    const date = new Date(Date.now() - rang * heure)
    await utimes(fichier, date, date)
  }
}

const colonne = (page: Page): Locator => page.getByLabel('Sessions et fichiers')

/** La ligne d'une conversation : la plus profonde, si elle est dans un groupe. */
const ligne = (page: Page, titre: string): Locator =>
  colonne(page).locator('li', { hasText: titre }).last()

/** Hauteur d'une ligne à l'écran, seule façon honnête de lire un ordre affiché. */
async function hauteur(page: Page, titre: string): Promise<number> {
  const cadre = await ligne(page, titre).boundingBox()
  if (!cadre) throw new Error(`« ${titre} » n'est pas à l'écran`)
  return cadre.y
}

async function ordre(page: Page, ...titres: string[]): Promise<string[]> {
  const hauteurs = await Promise.all(titres.map(async (t) => [t, await hauteur(page, t)] as const))
  return hauteurs.sort((a, b) => a[1] - b[1]).map(([t]) => t)
}

/**
 * Glisse une ligne sur une autre, par petits pas.
 *
 * `dragTo` déplace le curseur d'un seul bond. La liste suit le survol pour savoir
 * où elle déposera, et un bond unique peut ne jamais la faire passer au-dessus de
 * sa cible : le geste s'achevait alors sans que rien ne bouge. Le défaut ne se
 * voyait qu'une fois sur trois, et seulement dans la suite entière, là où le
 * premier glissement suit de près le chargement de la colonne.
 *
 * Le dernier point est envoyé deux fois. Le survol ne s'inscrit qu'au mouvement
 * suivant son arrivée, et le relâchement partait sinon sur une cible encore vide.
 */
async function glisser(
  page: Page,
  source: Locator,
  cible: Locator,
  position?: { x: number; y: number }
): Promise<void> {
  const depart = await source.boundingBox()
  const arrivee = await cible.boundingBox()
  if (!depart || !arrivee) throw new Error("la source ou la cible n'est pas à l'écran")

  await page.mouse.move(depart.x + depart.width / 2, depart.y + depart.height / 2)
  await page.mouse.down()
  const x = arrivee.x + (position?.x ?? arrivee.width / 2)
  const y = arrivee.y + (position?.y ?? arrivee.height / 2)
  await page.mouse.move(x, y, { steps: 12 })
  await page.mouse.move(x, y)
  await page.mouse.up()
}

test.describe('ranger les conversations à la main', () => {
  let ctx: Contexte

  test.beforeAll(async () => {
    const provisoire = await lancer()
    await semer(provisoire.projet)
    await fermer(provisoire, { nettoyer: false })
    ctx = await lancer({ donnees: provisoire.donnees, projet: provisoire.projet })
  })

  test.afterAll(async () => {
    await rm(dossierTranscrits(ctx.projet), { recursive: true, force: true })
    await fermer(ctx)
  })

  test("part de l'ordre du disque, la plus récente en tête", async () => {
    await expect(colonne(ctx.page).getByText('Alpha')).toBeVisible()
    expect(await ordre(ctx.page, 'Alpha', 'Beta', 'Gamma')).toEqual(['Alpha', 'Beta', 'Gamma'])
  })

  test('une conversation se déplace où on la dépose', async () => {
    // Déposée dans la moitié haute d'Alpha : elle passe devant.
    await glisser(ctx.page, ligne(ctx.page, 'Gamma'), ligne(ctx.page, 'Alpha'), { x: 60, y: 4 })
    await expect
      .poll(() => ordre(ctx.page, 'Alpha', 'Beta', 'Gamma'))
      .toEqual(['Gamma', 'Alpha', 'Beta'])
  })

  test("l'ordre voulu survit à un redémarrage", async () => {
    await fermer(ctx, { nettoyer: false })
    ctx = await lancer({ donnees: ctx.donnees, projet: ctx.projet })
    await expect(colonne(ctx.page).getByText('Gamma')).toBeVisible()
    expect(await ordre(ctx.page, 'Alpha', 'Beta', 'Gamma')).toEqual(['Gamma', 'Alpha', 'Beta'])
  })

  test('un groupe se crée et se nomme dans la foulée', async () => {
    await colonne(ctx.page).getByLabel('Nouveau groupe').click()

    // Le nom est demandé tout de suite : un groupe sans nom ne dit rien.
    const champ = ctx.page.getByLabel('Nom du groupe')
    await expect(champ).toBeFocused()
    await champ.fill('Attestation')
    await champ.press('Enter')

    await expect(ctx.page.getByRole('button', { name: 'Attestation' })).toBeVisible()
  })

  test('une conversation glissée sur le groupe le rejoint', async () => {
    await glisser(ctx.page, ligne(ctx.page, 'Beta'), ctx.page.getByRole('button', { name: 'Attestation' }))

    const groupe = colonne(ctx.page).getByLabel('Conversations de Attestation')
    await expect(groupe.getByText('Beta')).toBeVisible()
    // Et elle a quitté le premier niveau : elle n'est plus là qu'une fois.
    await expect(colonne(ctx.page).getByText('Beta')).toHaveCount(1)
  })

  test('le groupe se déplace avec son contenu', async () => {
    await glisser(
      ctx.page,
      ctx.page.getByRole('button', { name: 'Attestation' }),
      ligne(ctx.page, 'Alpha'),
      { x: 60, y: 44 }
    )

    await expect
      .poll(async () => (await hauteur(ctx.page, 'Alpha')) < (await hauteur(ctx.page, 'Beta')))
      .toBe(true)
    // Le contenu suit : le groupe n'est pas qu'une étiquette posée sur la liste.
    await expect(
      colonne(ctx.page).getByLabel('Conversations de Attestation').getByText('Beta')
    ).toBeVisible()
  })

  test('le clic droit renomme le groupe', async () => {
    await ctx.page.getByRole('button', { name: 'Attestation' }).click({ button: 'right' })
    await ctx.page.getByRole('menuitem', { name: 'Renommer le groupe' }).click()
    const champ = ctx.page.getByLabel('Nom du groupe')
    await champ.fill('OLV-166')
    await champ.press('Enter')

    await expect(ctx.page.getByRole('button', { name: 'OLV-166' })).toBeVisible()
    await expect(colonne(ctx.page).getByLabel('Conversations de OLV-166')).toBeVisible()
  })

  test('le groupe et son contenu survivent à un redémarrage', async () => {
    await fermer(ctx, { nettoyer: false })
    ctx = await lancer({ donnees: ctx.donnees, projet: ctx.projet })
    await expect(
      colonne(ctx.page).getByLabel('Conversations de OLV-166').getByText('Beta')
    ).toBeVisible()
  })

  test('replier le groupe cache son contenu sans le perdre', async () => {
    await ctx.page.getByLabel('Replier le groupe').click()
    await expect(colonne(ctx.page).getByText('Beta')).toHaveCount(0)
    await ctx.page.getByLabel('Déployer le groupe').click()
    await expect(colonne(ctx.page).getByText('Beta')).toBeVisible()
  })

  test('défaire le groupe rend ses conversations à la liste', async () => {
    await ctx.page.getByRole('button', { name: 'OLV-166' }).click({ button: 'right' })
    await ctx.page.getByRole('menuitem', { name: 'Défaire le groupe' }).click()

    await expect(ctx.page.getByRole('button', { name: 'OLV-166' })).toHaveCount(0)
    await expect(colonne(ctx.page).getByText('Beta')).toBeVisible()
  })

  test('le menu réunit une conversation dans un groupe neuf', async () => {
    // Le glisser-déposer demande de la précision ; le menu fait le même travail
    // sans viser, et c'est le seul chemin au clavier.
    await ligne(ctx.page, 'Gamma').getByRole('button').first().click({ button: 'right' })
    await ctx.page.getByRole('menuitem', { name: /Réunir dans un nouveau groupe/ }).click()

    const champ = ctx.page.getByLabel('Nom du groupe')
    await champ.fill('Chantier')
    await champ.press('Enter')

    await expect(
      colonne(ctx.page).getByLabel('Conversations de Chantier').getByText('Gamma')
    ).toBeVisible()
  })

  test('et la ressort du groupe', async () => {
    await ligne(ctx.page, 'Gamma').getByRole('button').first().click({ button: 'right' })
    await ctx.page.getByRole('menuitem', { name: 'Sortir du groupe' }).click()

    await expect(colonne(ctx.page).getByLabel('Conversations de Chantier')).toContainText(
      'Groupe vide'
    )
    await expect(colonne(ctx.page).getByText('Gamma')).toBeVisible()
  })
})
