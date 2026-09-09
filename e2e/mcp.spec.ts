import { readFile } from 'node:fs/promises'
import { networkInterfaces } from 'node:os'
import { join } from 'node:path'
import { expect, test } from '@playwright/test'
import { fermer, lancer, type Contexte } from './fixtures'

/**
 * Le serveur MCP, joint comme un agent le joindrait.
 *
 * Il vit dans le processus de l'application, qui tourne déjà. Un serveur lancé
 * par conversation pesait quatre-vingt-huit mégaoctets ; cinq conversations en
 * faisaient quatre cent quarante, contre cent quarante-neuf pour Claudex tout
 * entier.
 */
test.describe('serveur MCP', () => {
  let ctx: Contexte

  test.beforeAll(async () => {
    ctx = await lancer()

    // Le bouton de la page Services pose la configuration, et c'est elle qui
    // porte l'adresse et le jeton : les lire là vérifie aussi qu'elle est juste.
    await ctx.page.getByRole('button', { name: 'Services', exact: true }).click()
    await ctx.page.getByRole('button', { name: 'Poser le serveur MCP dans le projet' }).click()
  })

  test.afterAll(async () => {
    await fermer(ctx)
  })

  /** L'adresse et le jeton, relus à chaque fois : l'état fait foi. */
  const ou = async (): Promise<{ adresse: string; jeton: string; port: number }> => {
    const etat = JSON.parse(await readFile(join(ctx.donnees, 'state.json'), 'utf8'))
    const port = etat.mcpPort ?? 7317
    return { adresse: `http://127.0.0.1:${port}/mcp`, jeton: etat.mcpJeton, port }
  }

  /** Un appel au serveur, tel que Claude Code le fait. */
  const appeler = async (corps: object): Promise<Record<string, never>> => {
    const { adresse, jeton } = await ou()
    const reponse = await fetch(adresse, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json, text/event-stream',
        authorization: `Bearer ${jeton}`
      },
      body: JSON.stringify(corps)
    })
    const texte = await reponse.text()
    // Le transport répond en flux d'événements : la donnée est sur `data:`.
    const ligne = texte.split('\n').find((l) => l.startsWith('data:'))
    return JSON.parse(ligne ? ligne.slice(5) : texte)
  }

  test('annonce ses outils à qui porte le jeton', async () => {
    // L'état s'écrit en différé : on attend que le jeton y soit.
    await expect.poll(async () => (await ou()).jeton, { timeout: 10_000 }).toBeTruthy()

    await appeler({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2025-06-18',
        capabilities: {},
        clientInfo: { name: 'essai', version: '1' }
      }
    })
    const rendu = (await appeler({ jsonrpc: '2.0', id: 2, method: 'tools/list' })) as unknown as {
      result: { tools: { name: string }[] }
    }
    expect(rendu.result.tools.map((o) => o.name)).toEqual([
      'projets',
      'services',
      'journal',
      'demarrer',
      'arreter',
      'relancer',
      'depots',
      'diff'
    ])
  })

  test('refuse qui n’a pas le jeton', async () => {
    // Sans lui, tout processus de la machine pourrait démarrer et arrêter les
    // services, et lire le code des dépôts.
    const reponse = await fetch((await ou()).adresse, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' })
    })
    expect(reponse.status).toBe(401)
  })

  test('n’écoute que la boucle locale', async () => {
    // Ouvert sur toutes les interfaces, il offrirait les services du poste à qui
    // partage le réseau. C'est l'adresse de la machine sur son réseau qu'il faut
    // essayer : `0.0.0.0` retombe sur la boucle locale.
    const { port } = await ou()
    const dehors = Object.values(networkInterfaces())
      .flat()
      .find((i) => i && i.family === 'IPv4' && !i.internal)
    test.skip(!dehors, 'Aucune adresse de réseau sur cette machine.')

    await expect(
      fetch(`http://${dehors!.address}:${port}/mcp`, {
        method: 'POST',
        body: '{}',
        signal: AbortSignal.timeout(3000)
      })
    ).rejects.toThrow()
  })

  test('nomme le projet ouvert dans Claudex', async () => {
    const rendu = (await appeler({
      jsonrpc: '2.0',
      id: 3,
      method: 'tools/call',
      params: { name: 'projets', arguments: {} }
    })) as unknown as { result: { content: { text: string }[] } }
    expect(rendu.result.content[0]!.text).toContain('Projet test')
    expect(rendu.result.content[0]!.text).toContain('(regardé)')
  })
})
