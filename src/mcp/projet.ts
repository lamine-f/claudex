import { readFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'
import type { AppState, Workspace } from '@shared/types'

/**
 * Le dossier où Electron range les données de l'application.
 *
 * Calculé plutôt que demandé : le serveur MCP tourne sous
 * `ELECTRON_RUN_AS_NODE`, où le module `app` n'existe pas. Les emplacements
 * sont ceux qu'Electron choisit sur chaque système.
 */
export function dossierDonnees(): string {
  if (process.platform === 'darwin') {
    return join(homedir(), 'Library', 'Application Support', 'Claudex')
  }
  if (process.platform === 'win32') {
    return join(process.env.APPDATA || join(homedir(), 'AppData', 'Roaming'), 'Claudex')
  }
  return join(process.env.XDG_CONFIG_HOME || join(homedir(), '.config'), 'Claudex')
}

/**
 * L'identifiant que Claudex donne à un projet, retrouvé par son chemin.
 *
 * Le nom de session d'un service en dépend : sans lui, le serveur calculerait
 * un autre nom que l'application et ne verrait aucun service tourner.
 *
 * Le chemin est l'identité réelle d'un projet, l'identifiant n'en étant qu'une
 * étiquette. On cherche donc par le chemin, ce qui résiste à un projet retiré
 * puis rajouté.
 */
export async function identifiantDuProjet(projet: string): Promise<string | null> {
  const vise = resolve(projet)
  try {
    const brut = await readFile(join(dossierDonnees(), 'state.json'), 'utf8')
    const etat = JSON.parse(brut) as Partial<AppState>
    const trouve = (etat.workspaces ?? []).find((w: Workspace) => resolve(w.path) === vise)
    return trouve?.id ?? null
  } catch {
    // Claudex n'a jamais tourné, ou son état est illisible. Ce n'est pas une
    // erreur : le projet n'est simplement pas connu de lui.
    return null
  }
}
