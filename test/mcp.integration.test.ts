import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { ecrireMcp } from '../src/main/services/projets-services'

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
