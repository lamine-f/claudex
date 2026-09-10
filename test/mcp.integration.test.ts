import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { ecrireMcp, rafraichirMcp } from '../src/main/services/projets-services'

describe('poser le serveur MCP dans un projet', () => {
  let racine: string

  beforeAll(async () => {
    racine = await mkdtemp(join(tmpdir(), 'claudex-mcp-'))
  })

  afterAll(async () => {
    await rm(racine, { recursive: true, force: true })
  })

  const lu = async (projet: string): Promise<Record<string, never>> =>
    JSON.parse(await readFile(join(projet, '.mcp.json'), 'utf8'))

  /** Ce que l'IPC calcule à partir d'Electron, donné ici à la main. */
  const ou = {
    adresse: 'http://127.0.0.1:7317/mcp',
    jeton: 'un-jeton',
    portee: 'projet' as const,
    maison: '/chemin/de/maison'
  }

  it('écrit un fichier que Claude Code sait lire', async () => {
    const projet = join(racine, 'neuf')
    await mkdir(projet, { recursive: true })

    const chemin = await ecrireMcp(projet, ou)
    expect(chemin).toBe(join(projet, '.mcp.json'))

    const contenu = (await lu(projet)) as Record<string, Record<string, Record<string, unknown>>>
    const serveur = contenu.mcpServers?.claudex
    // L'entrée pointe le serveur que l'application porte déjà, avec le jeton
    // qui l'autorise : rien n'est lancé par conversation.
    expect(serveur?.type).toBe('http')
    expect(serveur?.url).toBe(ou.adresse)
    expect(serveur?.headers).toMatchObject({ Authorization: 'Bearer un-jeton' })
  })

  it('garde les autres serveurs déjà déclarés', async () => {
    // Le fichier appartient au projet, non à Claudex.
    const projet = join(racine, 'partage')
    await mkdir(projet, { recursive: true })
    await writeFile(
      join(projet, '.mcp.json'),
      JSON.stringify({ mcpServers: { autre: { command: 'ailleurs' } } })
    )

    await ecrireMcp(projet, ou)
    const contenu = (await lu(projet)) as Record<string, Record<string, Record<string, unknown>>>
    expect(contenu.mcpServers?.autre?.command).toBe('ailleurs')
    expect(contenu.mcpServers?.claudex).toBeTruthy()
  })

  it('met de côté ce qu’il remplace', async () => {
    const projet = join(racine, 'sauvegarde')
    await mkdir(projet, { recursive: true })
    await writeFile(join(projet, '.mcp.json'), '{"mcpServers":{"autre":{}}}')

    await ecrireMcp(projet, ou)
    expect(await readFile(join(projet, '.mcp.json.avant'), 'utf8')).toContain('autre')
  })

  it('ne perd pas un fichier illisible, et repart propre', async () => {
    const projet = join(racine, 'casse')
    await mkdir(projet, { recursive: true })
    await writeFile(join(projet, '.mcp.json'), '{ ceci n’est pas du JSON')

    await ecrireMcp(projet, ou)
    const contenu = (await lu(projet)) as Record<string, Record<string, unknown>>
    expect(contenu.mcpServers?.claudex).toBeTruthy()
    expect(await readFile(join(projet, '.mcp.json.avant'), 'utf8')).toContain('pas du JSON')
  })
})

describe('reprendre les configurations quand le port change', () => {
  let racine: string

  beforeAll(async () => {
    racine = await mkdtemp(join(tmpdir(), 'claudex-mcp-port-'))
  })

  afterAll(async () => {
    await rm(racine, { recursive: true, force: true })
  })

  const ou = (adresse: string): { adresse: string; jeton: string; maison: string } => ({
    adresse,
    jeton: 'un-jeton',
    maison: racine
  })

  it('corrige une entrée qui pointe vers l’ancien port', async () => {
    // Le port change quand celui qu'on retenait est pris. Sans cette reprise,
    // il faudrait recliquer le bouton, et rien ne dirait qu'il le faut.
    const projet = join(racine, 'projet')
    await mkdir(projet, { recursive: true })
    await ecrireMcp(projet, { ...ou('http://127.0.0.1:7317/mcp'), portee: 'projet' })

    const repris = await rafraichirMcp(ou('http://127.0.0.1:64857/mcp'), [projet])
    expect(repris).toEqual([join(projet, '.mcp.json')])

    const contenu = JSON.parse(await readFile(join(projet, '.mcp.json'), 'utf8'))
    expect(contenu.mcpServers.claudex.url).toBe('http://127.0.0.1:64857/mcp')
  })

  it('ne touche à rien quand l’adresse et le jeton sont bons', async () => {
    const projet = join(racine, 'inchange')
    await mkdir(projet, { recursive: true })
    await ecrireMcp(projet, { ...ou('http://127.0.0.1:7317/mcp'), portee: 'projet' })

    expect(await rafraichirMcp(ou('http://127.0.0.1:7317/mcp'), [projet])).toEqual([])
  })

  it('ne crée rien là où aucune entrée n’a été posée', async () => {
    // Poser le serveur est un geste ; le reprendre n'en est pas un.
    const projet = join(racine, 'jamais-branche')
    await mkdir(projet, { recursive: true })

    expect(await rafraichirMcp(ou('http://127.0.0.1:7317/mcp'), [projet])).toEqual([])
    await expect(readFile(join(projet, '.mcp.json'), 'utf8')).rejects.toThrow()
  })

  it('corrige aussi le jeton, quand c’est lui qui a changé', async () => {
    const projet = join(racine, 'jeton')
    await mkdir(projet, { recursive: true })
    await ecrireMcp(projet, { ...ou('http://127.0.0.1:7317/mcp'), portee: 'projet' })

    const repris = await rafraichirMcp(
      { adresse: 'http://127.0.0.1:7317/mcp', jeton: 'un-autre', maison: racine },
      [projet]
    )
    expect(repris).toHaveLength(1)
    const contenu = JSON.parse(await readFile(join(projet, '.mcp.json'), 'utf8'))
    expect(contenu.mcpServers.claudex.headers.Authorization).toBe('Bearer un-autre')
  })
})
