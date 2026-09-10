import { expect, test } from '@playwright/test'
import { attendreInvite, fermer, lancer, lireTerminaux, NOUVEAU_TERMINAL } from './fixtures'

/**
 * Le volet des consignes, tel qu'on s'en sert.
 *
 * Rien n'y part tout seul dans cette version : ce qui est vérifié ici est
 * qu'une consigne s'écrit, se corrige, se range, survit à la fermeture, et
 * arrive dans le terminal quand on le demande.
 */

/** Ouvre le volet et attend qu'il soit là. */
async function ouvrirVolet(page: import('@playwright/test').Page): Promise<void> {
  await page.getByTitle('Afficher les tâches').click()
  await expect(page.getByRole('region', { name: 'Consignes préparées' })).toBeVisible()
}

async function ecrire(page: import('@playwright/test').Page, texte: string): Promise<void> {
  await page.getByLabel('Écrire une consigne').fill(texte)
  await page.getByRole('button', { name: 'Ajouter', exact: true }).click()
}

test('une consigne s’écrit, se corrige et se range', async () => {
  const contexte = await lancer()
  try {
    const { page } = contexte
    await page.getByTitle(NOUVEAU_TERMINAL).click()
    await ouvrirVolet(page)

    const file = page.getByRole('list', { name: 'File des consignes' })
    await expect(file).toContainText('Rien en attente')

    await ecrire(page, 'Reprends la pagination')
    await ecrire(page, 'Relis le diff')

    // L'ordre est celui de l'écriture : la première consigne écrite est la
    // première de la file.
    await expect(file.getByRole('listitem')).toHaveCount(2)
    await expect(file.getByRole('listitem').first()).toContainText('Reprends la pagination')

    // Le champ s'est vidé, et garde la main pour la consigne suivante.
    await expect(page.getByLabel('Écrire une consigne')).toHaveValue('')

    // Correction sur place, dans le même champ qui a servi à écrire.
    await file.getByRole('listitem').first().hover()
    await file.getByRole('button', { name: 'Corriger' }).first().click()
    await page.getByLabel('Corriger la consigne').fill('Reprends la pagination du catalogue')
    await page.getByRole('button', { name: 'Enregistrer' }).click()
    await expect(file.getByRole('listitem').first()).toContainText('du catalogue')

    // Retrait : la file redescend à une consigne.
    await file.getByRole('listitem').last().hover()
    await file.getByRole('button', { name: 'Retirer de la file' }).last().click()
    await expect(file.getByRole('listitem')).toHaveCount(1)
  } finally {
    await fermer(contexte)
  }
})

test('une consigne validée survit à la fermeture de l’application', async () => {
  const premier = await lancer()
  try {
    await premier.page.getByTitle(NOUVEAU_TERMINAL).click()
    await ouvrirVolet(premier.page)
    await ecrire(premier.page, 'À faire demain')
  } finally {
    await fermer(premier, { nettoyer: false })
  }

  const second = await lancer({ donnees: premier.donnees, projet: premier.projet })
  try {
    // Le volet était ouvert : il l'est encore, comme les deux autres.
    const file = second.page.getByRole('list', { name: 'File des consignes' })
    await expect(file.getByRole('listitem').first()).toContainText('À faire demain')
  } finally {
    await fermer(second)
  }
})

test('envoyer une consigne l’écrit dans le terminal de sa conversation', async () => {
  const contexte = await lancer()
  try {
    const { page } = contexte
    await page.getByTitle(NOUVEAU_TERMINAL).click()
    await expect(page.locator('.xterm')).toHaveCount(1)
    // Un shell affiche son invite avant d'être prêt à lire son entrée, et avale
    // sinon ce qu'on lui envoie. C'est vrai de toute frappe, celle-ci comprise.
    await attendreInvite(page, 0)
    await ouvrirVolet(page)

    await ecrire(page, 'echo MARQUE_CONSIGNE')

    const file = page.getByRole('list', { name: 'File des consignes' })
    await file.getByRole('listitem').first().hover()
    await file.getByRole('button', { name: 'Envoyer dans le terminal' }).first().click()

    // Ce qui part quitte la file : une consigne envoyée n'est plus en attente.
    await expect(file).toContainText('Rien en attente')

    // Et arrive dans le terminal, comme si on l'avait tapée soi-même. Deux
    // occurrences : la commande telle qu'elle s'écrit, et ce qu'elle affiche.
    // Une seule dirait que le texte est arrivé sans être validé, c'est-à-dire
    // que le collage encadré ou le retour chariot n'ont pas fait leur travail.
    await expect
      .poll(
        async () =>
          ((await lireTerminaux(page))[0]?.lignes.join('\n') ?? '').split('MARQUE_CONSIGNE')
            .length - 1,
        {
          message: 'la consigne n’est jamais arrivée dans le terminal',
          timeout: 20_000
        }
      )
      .toBeGreaterThanOrEqual(2)
  } finally {
    await fermer(contexte)
  }
})

test('une image jointe est écrite hors du projet, et se voit', async () => {
  const contexte = await lancer()
  try {
    const { page } = contexte
    await page.getByTitle(NOUVEAU_TERMINAL).click()
    await ouvrirVolet(page)

    // Le collage n'est pas pilotable : on entre par la même porte que lui,
    // celle que le champ appelle quand une image arrive.
    const chemin = await page.evaluate(async () => {
      const carre = new Uint8Array([
        137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82, 0, 0, 0, 1, 0, 0, 0, 1, 8,
        2, 0, 0, 0, 144, 119, 83, 222, 0, 0, 0, 12, 73, 68, 65, 84, 8, 215, 99, 248, 207, 192, 0,
        0, 3, 1, 1, 0, 24, 221, 141, 176, 0, 0, 0, 0, 73, 69, 78, 68, 174, 66, 96, 130
      ])
      return window.claudex.taches.joindre(carre, 'image/png')
    })

    expect(chemin).toContain('taches')
    expect(chemin).not.toContain(contexte.projet)

    // La vignette passe par le schéma des médias : si le dossier des consignes
    // n'y était pas autorisé, l'image resterait vide.
    await page.evaluate((image) => {
      const zone = document.querySelector('[aria-label="Consignes préparées"]')
      const essai = document.createElement('img')
      essai.id = 'essai-vignette'
      essai.src = `claudex-media://fichier/${encodeURIComponent(image)}`
      zone?.appendChild(essai)
    }, chemin)

    await expect
      .poll(
        async () =>
          page.evaluate(
            () => (document.getElementById('essai-vignette') as HTMLImageElement).naturalWidth
          ),
        { message: 'la vignette n’a jamais été servie' }
      )
      .toBeGreaterThan(0)
  } finally {
    await fermer(contexte)
  }
})

test('une image collée dans le champ devient une consigne illustrée', async () => {
  const contexte = await lancer()
  try {
    const { page } = contexte
    await page.getByTitle(NOUVEAU_TERMINAL).click()
    await ouvrirVolet(page)

    // Le collage tel que le navigateur le voit : une capture d'écran arrive
    // dans le presse-papier comme un fichier, sans texte à côté.
    await page.evaluate(() => {
      const svg =
        '<svg xmlns="http://www.w3.org/2000/svg" width="8" height="8">' +
        '<rect width="8" height="8" fill="#e8825a"/></svg>'
      const fichier = new File([svg], 'capture.svg', { type: 'image/svg+xml' })
      const transfert = new DataTransfer()
      transfert.items.add(fichier)
      const champ = document.querySelector('textarea[aria-label="Écrire une consigne"]')
      champ?.dispatchEvent(
        new ClipboardEvent('paste', { clipboardData: transfert, bubbles: true, cancelable: true })
      )
    })

    // La vignette paraît sous le champ, avant même que la consigne n'existe :
    // on voit ce qu'on joint pendant qu'on écrit ce qui va avec.
    const jointes = page.getByRole('list', { name: 'Images jointes' })
    await expect(jointes.getByRole('listitem')).toHaveCount(1)

    await page.getByLabel('Écrire une consigne').fill('Ce bandeau déborde')
    await page.getByRole('button', { name: 'Ajouter', exact: true }).click()

    const file = page.getByRole('list', { name: 'File des consignes' })
    await expect(file.getByRole('listitem').first()).toContainText('Ce bandeau déborde')
    await expect(file.getByRole('list', { name: 'Images jointes' })).toBeVisible()

    // Et l'image part avec la consigne : son chemin s'écrit dans le terminal.
    await file.getByRole('listitem').first().hover()
    await file.getByRole('button', { name: 'Envoyer dans le terminal' }).first().click()
    await expect
      .poll(async () => (await lireTerminaux(page))[0]?.lignes.join('\n') ?? '', {
        message: 'le chemin de l’image n’est jamais arrivé dans le terminal',
        timeout: 20_000
      })
      .toContain('.svg')
  } finally {
    await fermer(contexte)
  }
})
