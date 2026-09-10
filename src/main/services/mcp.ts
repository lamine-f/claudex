import { randomBytes } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { serveurDesOutils } from '../../mcp/outils'
import { ecrireMcp } from './projets-services'
import * as store from './store'

/**
 * Le serveur MCP, dans le processus qui tourne déjà.
 *
 * Un serveur lancé par conversation pesait quatre-vingt-huit mégaoctets :
 * mesuré, cinq conversations en faisaient quatre cent quarante, contre cent
 * quarante-neuf pour Claudex tout entier. Ici, le coût est nul.
 *
 * Il n'écoute que sur la boucle locale et exige un jeton. Sans lui, tout
 * processus de la machine pourrait démarrer et arrêter les services, et lire
 * le code des dépôts.
 */

/**
 * Le dossier de l'utilisateur, où vit `~/.claude.json`.
 *
 * Remplaçable : sans cela, un essai de bout en bout écrirait dans la vraie
 * configuration de Claude Code, et une suite de tests changerait les réglages
 * de qui la lance.
 */
function maison(): string {
  return process.env.CLAUDEX_MAISON || homedir()
}

/** Le port par défaut. Retenu dès qu'il a servi, pour que la configuration reste vraie. */
const PORT_VOULU = 7317

let serveur: Server | null = null
let portOuvert: number | null = null

/**
 * Le jeton qui autorise un agent.
 *
 * Retenu plutôt que régénéré à chaque lancement : la configuration de Claude
 * Code le porte, et le changer la rendrait fausse toutes les nuits.
 */
export function jeton(): string {
  const etat = store.get()
  if (etat.mcpJeton) return etat.mcpJeton
  const neuf = randomBytes(24).toString('base64url')
  store.update((e) => {
    e.mcpJeton = neuf
  })
  return neuf
}

/** L'adresse à donner à Claude Code, ou rien si le serveur n'écoute pas. */
export function adresse(): string | null {
  return portOuvert === null ? null : `http://127.0.0.1:${portOuvert}/mcp`
}

/**
 * Ouvre le serveur.
 *
 * Le port retenu d'abord, puis un port libre s'il est pris. Le rendre au
 * lancement permet de réécrire la configuration quand il a changé.
 */
export async function ouvrir(): Promise<number | null> {
  if (portOuvert !== null) return portOuvert

  // Le jeton est fabriqué ici plutôt qu'à la première requête : le fichier
  // d'état s'écrit en différé, et qui le lit aussitôt après le démarrage ne l'y
  // trouverait pas.
  jeton()

  const attendu = store.get().mcpPort ?? PORT_VOULU
  for (const port of [attendu, 0]) {
    const ouvert = await essayer(port)
    if (ouvert !== null) {
      portOuvert = ouvert
      if (ouvert !== attendu) {
        store.update((e) => {
          e.mcpPort = ouvert
        })
      }
      return ouvert
    }
  }
  return null
}

export function fermer(): void {
  serveur?.close()
  serveur = null
  portOuvert = null
}

function essayer(port: number): Promise<number | null> {
  return new Promise((resoudre) => {
    const candidat = createServer(repondre)
    candidat.once('error', () => resoudre(null))
    // La boucle locale seulement : ouvrir sur toutes les interfaces offrirait
    // les services du poste à qui partage le réseau.
    candidat.listen(port, '127.0.0.1', () => {
      serveur = candidat
      const adresse = candidat.address()
      resoudre(typeof adresse === 'object' && adresse ? adresse.port : null)
    })
  })
}

/**
 * Une requête, portée à un transport neuf.
 *
 * Sans session : chaque appel se suffit, et l'état qui compte vit dans
 * l'application, non dans la conversation.
 */
async function repondre(requete: IncomingMessage, reponse: ServerResponse): Promise<void> {
  if (!autorise(requete)) {
    reponse.writeHead(401, { 'content-type': 'application/json' })
    reponse.end(JSON.stringify({ error: 'Jeton absent ou faux.' }))
    return
  }

  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined })
  const serveurMcp = serveurDesOutils({
    tous: () =>
      store.get().workspaces.map((w) => ({ id: w.id, nom: w.name, chemin: w.path })),
    actif: () => {
      const etat = store.get()
      const trouve = etat.workspaces.find((w) => w.id === etat.activeWorkspaceId)
      return trouve ? { id: trouve.id, nom: trouve.name, chemin: trouve.path } : undefined
    }
  })

  reponse.on('close', () => {
    void transport.close()
    void serveurMcp.close()
  })

  await serveurMcp.connect(transport)
  await transport.handleRequest(requete, reponse)
}

/**
 * Le jeton, lu là où les clients MCP le posent.
 *
 * L'en-tête d'autorisation est la voie normale. Le paramètre d'URL sert aux
 * clients qui ne savent pas poser d'en-tête.
 */
function autorise(requete: IncomingMessage): boolean {
  const attendu = jeton()
  const entete = requete.headers.authorization
  if (entete === `Bearer ${attendu}`) return true

  try {
    const url = new URL(requete.url ?? '/', 'http://127.0.0.1')
    return url.searchParams.get('jeton') === attendu
  } catch {
    return false
  }
}

/**
 * Dit à Claude Code où joindre ce serveur, pour tous les projets.
 *
 * Le réglage est global : il ne dépend d'aucun projet, et n'a donc pas sa place
 * dans la barre d'un projet. L'entrée va dans la configuration de
 * l'utilisateur, et aucun dépôt n'est touché.
 */
export async function brancherAgents(): Promise<{ ok: boolean; message: string }> {
  const url = adresse()
  if (!url) {
    return { ok: false, message: 'Le serveur n’écoute pas. Relance l’application.' }
  }

  try {
    const fichier = await ecrireMcp('', {
      adresse: url,
      jeton: jeton(),
      portee: 'utilisateur',
      maison: maison()
    })
    return { ok: true, message: `Les agents joindront Claudex. Écrit dans ${fichier}.` }
  } catch (erreur) {
    return { ok: false, message: (erreur as Error).message }
  }
}

/** Vrai quand la configuration de l'utilisateur pointe bien vers ce serveur. */
export async function agentsBranches(): Promise<boolean> {
  const url = adresse()
  if (!url) return false
  try {
    const brut = await readFile(join(maison(), '.claude.json'), 'utf8')
    const lu = JSON.parse(brut) as { mcpServers?: Record<string, { url?: string }> }
    return lu.mcpServers?.claudex?.url === url
  } catch {
    return false
  }
}
