import { expect, test } from '@playwright/test'
import { attendreInvite, fermer, lancer, lireTerminaux, NOUVEAU_TERMINAL, simulerRedemarrage, SUR_WINDOWS, taper } from './fixtures'

test('un terminal se relève après un redémarrage de la machine', async () => {
  const premier = await lancer()
  await premier.page.getByTitle(NOUVEAU_TERMINAL).click()
  await attendreInvite(premier.page, 0)
  await taper(premier.page, 0, 'echo TRACE_AVANT_REDEMARRAGE', 'TRACE_AVANT_REDEMARRAGE')

  await fermer(premier, { nettoyer: false })

  // Le redémarrage emporte le serveur tmux : les sessions ne survivent pas, seul
  // ce que Claudex a mis de côté permet de reprendre.
  await simulerRedemarrage()

  const second = await lancer({ donnees: premier.donnees, projet: premier.projet })
  try {
    await expect(second.page.locator('.xterm')).toHaveCount(1)

    // L'écran d'avant est restitué : le travail précédent reste sous les yeux.
    await expect
      .poll(async () => (await lireTerminaux(second.page))[0]?.lignes.join('\n') ?? '', {
        timeout: 15_000
      })
      .toContain('TRACE_AVANT_REDEMARRAGE')

    // Rien ne tournait : il n'y a rien à reprendre, donc pas de bande.
    await expect(second.page.getByText(/Relancer la commande/)).toHaveCount(0)
  } finally {
    await fermer(second)
  }
})

test("l'écran restitué n'est pas rejoué dans le shell", async () => {
  const premier = await lancer()
  await premier.page.getByTitle(NOUVEAU_TERMINAL).click()
  await attendreInvite(premier.page, 0)
  await taper(premier.page, 0, 'echo MARQUE_INERTE', 'MARQUE_INERTE')
  await fermer(premier, { nettoyer: false })
  await simulerRedemarrage()

  const second = await lancer({ donnees: premier.donnees, projet: premier.projet })
  try {
    await expect
      .poll(async () => (await lireTerminaux(second.page))[0]?.lignes.join('\n') ?? '', {
        timeout: 15_000
      })
      .toContain('MARQUE_INERTE')

    // Les traces d'avant sont écrites dans l'affichage, jamais renvoyées au shell :
    // les rejouer relancerait des commandes à l'insu de l'utilisateur.
    await new Promise((r) => setTimeout(r, 1500))
    const lignes = (await lireTerminaux(second.page))[0]?.lignes.join('\n') ?? ''
    expect(lignes.split('MARQUE_INERTE').length - 1).toBeLessThanOrEqual(2)
  } finally {
    await fermer(second)
  }
})

test('une commande interrompue par le redémarrage est proposée à la relance', async () => {
  // La bande de reprise nomme la commande qui tournait, et le pilote ConPTY ne
  // sait pas la lire : il faudrait interroger WMI pour chaque onglet toutes les
  // trente secondes afin d'obtenir la ligne de commande du processus au premier
  // plan. Le cas est écarté sur Windows plutôt que désarmé — il redeviendra vrai
  // le jour où le pilote saura répondre.
  test.skip(SUR_WINDOWS, 'le pilote ConPTY ne relève pas la commande en cours')

  const premier = await lancer()
  await premier.page.getByTitle(NOUVEAU_TERMINAL).click()
  await attendreInvite(premier.page, 0)

  // Une commande longue, du genre de celles qu'un redémarrage interrompt : un
  // serveur de développement, une compilation en veille.
  await taper(premier.page, 0, 'sleep 3600', '')
  await premier.page.waitForTimeout(1500)
  await fermer(premier, { nettoyer: false })
  await simulerRedemarrage()

  const second = await lancer({ donnees: premier.donnees, projet: premier.projet })
  try {
    // La bande nomme ce qui tournait et propose de le relancer.
    await expect(second.page.getByText(/sleep 3600/)).toBeVisible({ timeout: 15_000 })
    await expect(second.page.getByRole('button', { name: 'Relancer la commande' })).toBeVisible()

    // Tant qu'on n'a rien demandé, la commande n'est pas rejouée.
    const relancee = await second.page.evaluate(async () => {
      const onglets = await window.claudex.term.list('ws1')
      return onglets[0]?.lastCommand
    })
    expect(relancee).toContain('sleep 3600')
  } finally {
    await fermer(second)
  }
})
