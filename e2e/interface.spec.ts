import { expect, test } from '@playwright/test'
import { fermer, lancer, type Contexte } from './fixtures'

/**
 * Replier les colonnes rend leur largeur au terminal, qui est ce qu'on regarde.
 */
test.describe('replier les colonnes', () => {
  let ctx: Contexte

  test.beforeAll(async () => {
    ctx = await lancer()
  })

  test.afterAll(async () => {
    await fermer(ctx)
  })

  test('la colonne des projets se masque et revient', async () => {
    const projets = ctx.page.getByLabel('Projets', { exact: true })
    await expect(projets).toBeVisible()

    await ctx.page.getByRole('button', { name: 'Masquer les projets' }).click()
    await expect(projets).toHaveCount(0)

    await ctx.page.getByRole('button', { name: 'Afficher les projets' }).click()
    await expect(projets).toBeVisible()
  })

  test('la colonne des conversations se masque et revient', async () => {
    const colonne = ctx.page.getByLabel('Sessions et fichiers')
    await expect(colonne).toBeVisible()

    await ctx.page.getByRole('button', { name: 'Masquer la colonne' }).click()
    await expect(colonne).toHaveCount(0)

    await ctx.page.getByRole('button', { name: 'Afficher la colonne' }).click()
    await expect(colonne).toBeVisible()
  })

  test('l’état des panneaux survit à un redémarrage', async () => {
    await ctx.page.getByRole('button', { name: 'Masquer les projets' }).click()
    await expect(ctx.page.getByLabel('Projets', { exact: true })).toHaveCount(0)

    await fermer(ctx, { nettoyer: false })
    ctx = await lancer({ donnees: ctx.donnees, projet: ctx.projet })

    // Ce qu'on a replié doit le rester : le redéplier à chaque ouverture
    // annulerait le geste.
    await expect(ctx.page.getByLabel('Projets', { exact: true })).toHaveCount(0)
    await ctx.page.getByRole('button', { name: 'Afficher les projets' }).click()
    await expect(ctx.page.getByLabel('Projets', { exact: true })).toBeVisible()
  })
})

test.describe('recherche de projet', () => {
  let ctx: Contexte

  test.beforeAll(async () => {
    ctx = await lancer()
  })

  test.afterAll(async () => {
    await fermer(ctx)
  })

  test('le filtre restreint la liste des projets', async () => {
    const projets = ctx.page.getByLabel('Projets', { exact: true })
    await expect(projets.getByText('Projet test')).toBeVisible()

    await ctx.page.getByLabel('Rechercher un projet').fill('introuvable')
    await expect(projets.getByText('Projet test')).toHaveCount(0)
    await expect(projets.getByText('Aucun projet ne correspond.')).toBeVisible()

    await ctx.page.getByLabel('Rechercher un projet').fill('')
    await expect(projets.getByText('Projet test')).toBeVisible()
  })

  test('le chemin compte autant que le nom', async () => {
    // On cherche parfois un projet dont on ne retient que l'endroit où il vit.
    await ctx.page.getByLabel('Rechercher un projet').fill('claudex-projet')
    await expect(
      ctx.page.getByLabel('Projets', { exact: true }).getByText('Projet test')
    ).toBeVisible()
    await ctx.page.getByLabel('Rechercher un projet').fill('')
  })
})

/**
 * La barre du haut réserve 88 px à gauche pour les feux du système, que macOS
 * pose dessus. Ailleurs la fenêtre garde son cadre : le retrait n'y laisserait
 * qu'un trou, le nom du projet flottant au milieu de rien.
 */
test.describe('barre du haut', () => {
  let ctx: Contexte

  test.beforeAll(async () => {
    ctx = await lancer()
  })

  test.afterAll(async () => {
    await fermer(ctx)
  })

  test('ne réserve la place des feux que sur macOS', async () => {
    const retrait = await ctx.page.evaluate(() => {
      const barre = document.querySelector('header.zone-glissable')
      return barre ? getComputedStyle(barre).paddingLeft : ''
    })
    expect(retrait).toBe(process.platform === 'darwin' ? '88px' : '8px')
  })
})

/**
 * La barre de menus, là où le système la dessine dans la fenêtre.
 *
 * Elle porte les entrées par défaut d'Electron et rien de propre à Claudex, mais
 * elle empile une seconde rangée de chrome au-dessus de la bande du haut :
 * mesuré, vingt-six pixels pris au terminal, qui est ce qu'on regarde.
 */
test.describe('barre de menus', () => {
  let ctx: Contexte

  test.beforeAll(async () => {
    ctx = await lancer()
  })

  test.afterAll(async () => {
    await fermer(ctx)
  })

  test('est retirée hors de macOS, où elle vit dans la barre du système', async () => {
    const etat = await ctx.app.evaluate(({ BrowserWindow, Menu }) => {
      const f = BrowserWindow.getAllWindows()[0]!
      return {
        menu: Menu.getApplicationMenu() !== null,
        chrome: f.getBounds().height - f.getContentBounds().height
      }
    })
    const surMac = process.platform === 'darwin'
    expect(etat.menu).toBe(surMac)
    // La hauteur perdue au chrome dit ce que la mesure vaut : une barre de titre
    // seule sur Windows, une barre de titre et un menu sans le retrait.
    if (!surMac) expect(etat.chrome).toBeLessThan(50)
  })

  test('le presse-papiers marche quand même dans un champ', async () => {
    // C'est ce qui aurait pu se payer cher : les raccourcis d'édition passaient
    // pour dépendre des accélérateurs du menu. Ils n'en dépendent pas, Chromium
    // les traitant lui-même sur une zone éditable — mais cela se vérifie plutôt
    // que se suppose, et ce cas tombera si la conclusion cesse d'être vraie.
    const champ = ctx.page.getByPlaceholder('Rechercher')
    await champ.click()
    await champ.fill('bonjour presse-papiers')
    await ctx.page.keyboard.press('Control+A')
    await ctx.page.keyboard.press('Control+C')
    await champ.fill('')
    await ctx.page.keyboard.press('Control+V')
    await expect(champ).toHaveValue('bonjour presse-papiers')
  })
})
