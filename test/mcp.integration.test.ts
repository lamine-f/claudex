import { execFile, spawn } from 'node:child_process'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { promisify } from 'node:util'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { ecrireMcp } from '../src/main/services/projets-services'

const run = promisify(execFile)

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
  const ou = { executable: '/chemin/de/Claudex', serveur: '/chemin/de/out/main/mcp.js' }

  it('écrit un fichier que Claude Code sait lire', async () => {
    const projet = join(racine, 'neuf')
    await mkdir(projet, { recursive: true })

    const chemin = await ecrireMcp(projet, ou)
    expect(chemin).toBe(join(projet, '.mcp.json'))

    const contenu = (await lu(projet)) as Record<string, Record<string, Record<string, unknown>>>
    const serveur = contenu.mcpServers?.claudex
    expect(serveur?.command).toBe(ou.executable)
    // Le projet est passé en argument, non déduit du dossier courant : un agent
    // lancé dans un sous-dossier doit voir les mêmes services.
    expect(serveur?.args).toContain(projet)
    // Electron lance son moteur Node, ce qui évite d'exiger un Node installé.
    expect(serveur?.env).toMatchObject({ ELECTRON_RUN_AS_NODE: '1' })
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

/**
 * Le serveur lui-même, parlé sur l'entrée et la sortie standard.
 *
 * Il tourne sous le moteur Node d'Electron, comme Claude Code le lancera.
 */
describe('le serveur MCP répond au protocole', () => {
  let racine: string
  const electron = resolve('node_modules/electron/dist/Electron.app/Contents/MacOS/Electron')
  const serveur = resolve('out/main/mcp.js')

  beforeAll(async () => {
    racine = await mkdtemp(join(tmpdir(), 'claudex-mcp-dialogue-'))
  })

  afterAll(async () => {
    await rm(racine, { recursive: true, force: true })
  })

  /**
   * Envoie une suite de messages au serveur et rend ses réponses.
   *
   * Par `spawn` et non `execFile` : il faut écrire sur l'entrée du processus,
   * ce que le second ne sait pas faire.
   */
  function dialoguer(projet: string, appels: object[]): Promise<Record<string, never>[]> {
    const messages = [
      {
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2025-06-18',
          capabilities: {},
          clientInfo: { name: 'essai', version: '1' }
        }
      },
      { jsonrpc: '2.0', method: 'notifications/initialized' },
      ...appels
    ]

    return new Promise((resoudre, rejeter) => {
      const enfant = spawn(electron, [serveur, '--projet', projet], {
        env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }
      })
      let sortie = ''
      let plainte = ''
      enfant.stdout.on('data', (b) => (sortie += String(b)))
      enfant.stderr.on('data', (b) => (plainte += String(b)))
      enfant.on('error', rejeter)
      enfant.on('close', () => {
        const lignes = sortie.split('\n').filter(Boolean)
        if (lignes.length === 0) return rejeter(new Error(plainte || 'Le serveur n’a rien dit.'))
        resoudre(lignes.map((l) => JSON.parse(l)))
      })
      // Fermer l'entrée fait sortir le serveur une fois qu'il a répondu.
      enfant.stdin.end(messages.map((m) => JSON.stringify(m)).join('\n') + '\n')
    })
  }

  it('annonce ses outils', async () => {
    const projet = join(racine, 'vide')
    await mkdir(projet, { recursive: true })

    const reponses = await dialoguer(projet, [
      { jsonrpc: '2.0', id: 2, method: 'tools/list' }
    ])
    const outils = (reponses.at(-1) as unknown as { result: { tools: { name: string }[] } }).result.tools
    expect(outils.map((o) => o.name)).toEqual([
      'services',
      'journal',
      'demarrer',
      'arreter',
      'relancer',
      'depots',
      'diff'
    ])
  })

  it('lit les dépôts du projet sans que Claudex tourne', async () => {
    // Le serveur ne parle jamais à l'application : il lit la même déclaration
    // et interroge le même git.
    const projet = join(racine, 'avec-depot')
    await mkdir(projet, { recursive: true })
    await run('git', ['-C', projet, 'init', '-q', '-b', 'principale'])
    await run('git', ['-C', projet, 'config', 'user.email', 'e@e'])
    await run('git', ['-C', projet, 'config', 'user.name', 'E'])
    await writeFile(join(projet, 'base.txt'), 'un\n')
    await run('git', ['-C', projet, 'add', '-A'])
    await run('git', ['-C', projet, 'commit', '-qm', 'base'])
    await writeFile(join(projet, 'base.txt'), 'deux\n')

    const reponses = await dialoguer(projet, [
      { jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'depots', arguments: {} } }
    ])
    const dit = (reponses.at(-1) as unknown as { result: { content: { text: string }[] } }).result.content[0]!
      .text
    expect(dit).toContain('principale')
    expect(dit).toContain('base.txt')
  })

  it('dit qu’un projet inconnu de Claudex ne porte pas de services', async () => {
    // Le nom de session d'un service dépend de l'identifiant que Claudex donne
    // au projet. Sans lui, en inventer un ferait chercher des sessions qui
    // n'existent pas.
    const projet = join(racine, 'inconnu')
    await mkdir(join(projet, '.claudex'), { recursive: true })
    await writeFile(
      join(projet, '.claudex', 'services.yml'),
      'services:\n  - nom: veilleuse\n    commande: sleep 1\n'
    )

    const reponses = await dialoguer(projet, [
      { jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'services', arguments: {} } }
    ])
    const dit = (reponses.at(-1) as unknown as { result: { content: { text: string }[] } }).result.content[0]!
      .text
    expect(dit).toContain('projet de Claudex')
  })
})
