import { mkdir } from 'node:fs/promises'
import { basename } from 'node:path'
import chokidar, { type FSWatcher } from 'chokidar'
import type { WebContents } from 'electron'
import { dernierRegarde } from '@shared/onglets'
import { claudeProjectPath } from '../util/paths'
import * as store from './store'

/**
 * Un veilleur par dossier de transcrits surveillé, et le destinataire du moment.
 *
 * Comme pour les veilleurs de fichiers, le destinataire est gardé à part plutôt
 * que capturé dans l'écouteur. `surveiller` est rappelé à chaque retour sur un
 * projet et rend la main quand le veilleur est déjà là : celui-ci gardait donc à
 * jamais la fenêtre du premier appel. Après un rechargement de l'interface, une
 * conversation lancée à la main dans un terminal n'était plus signalée à
 * personne, et il fallait relancer l'application pour la voir apparaître.
 */
const veilleurs = new Map<string, { veilleur: FSWatcher; destinataire: WebContents }>()

/**
 * Surveille les conversations qui apparaissent dans les projets ouverts.
 *
 * Claudex connaît d'avance l'identifiant des sessions qu'il lance lui-même. Mais
 * rien n'empêche de taper `claude` directement dans un terminal : sans cette
 * veille, cette conversation-là ne serait rattachée à aucun onglet, et donc
 * impossible à reprendre automatiquement au démarrage suivant.
 */
export async function surveiller(
  cheminWorkspace: string,
  destinataire: WebContents
): Promise<void> {
  const dossier = claudeProjectPath(cheminWorkspace)
  const pose = veilleurs.get(dossier)
  if (pose) {
    pose.destinataire = destinataire
    return
  }

  // Le dossier n'existe pas tant qu'aucune conversation n'y a eu lieu, et on ne
  // peut pas surveiller ce qui n'est pas là. Le créer est sans conséquence :
  // Claude Code le créerait lui-même à la première session ouverte ici.
  await mkdir(dossier, { recursive: true }).catch(() => undefined)

  const veilleur = chokidar.watch(dossier, {
    ignoreInitial: true,
    depth: 0,
    // Un transcript s'écrit en continu : attendre qu'il soit posé évite de le
    // rattacher avant même qu'il ne porte quoi que ce soit.
    awaitWriteFinish: { stabilityThreshold: 400, pollInterval: 100 }
  })

  veilleur.on('add', (fichier) => {
    if (!fichier.endsWith('.jsonl')) return
    const uuid = basename(fichier, '.jsonl')
    rattacher(cheminWorkspace, uuid)
    // Relu à chaque événement, jamais capturé : c'est ce qui permet au veilleur
    // de survivre au rechargement de la fenêtre.
    const cible = veilleurs.get(dossier)?.destinataire
    if (cible && !cible.isDestroyed()) cible.send('claude:sessionDetectee', cheminWorkspace, uuid)
  })

  veilleurs.set(dossier, { veilleur, destinataire })
}

/**
 * Rattache une conversation à un onglet du projet qui n'en a pas encore.
 *
 * Le plus récemment actif est retenu : c'est celui où l'on vient de taper la
 * commande.
 */
function rattacher(cheminWorkspace: string, uuid: string): void {
  store.update((etat) => {
    const workspace = etat.workspaces.find((w) => w.path === cheminWorkspace)
    if (!workspace) return

    const dejaPris = etat.tabs.some((t) => t.claudeSessionId === uuid)
    if (dejaPris) return

    const candidat = dernierRegarde(
      etat.tabs.filter((t) => t.workspaceId === workspace.id && !t.claudeSessionId)
    )
    if (!candidat) return

    candidat.claudeSessionId = uuid
    candidat.claudeProjectDir = claudeProjectPath(cheminWorkspace)

    // Le nom d'une branche est attaché ici, au plus tôt : Claude Code ne donne
    // son identifiant qu'en écrivant son transcrit, et attendre que le renderer
    // s'en charge le perdrait s'il avait fermé l'onglet entre-temps.
    if (candidat.forkedFrom) {
      const noms = (etat.nomsSessions ??= {})
      noms[uuid] = candidat.title
    }
  })
}

export function cesser(cheminWorkspace: string): void {
  const dossier = claudeProjectPath(cheminWorkspace)
  void veilleurs.get(dossier)?.veilleur.close()
  veilleurs.delete(dossier)
}

export function toutArreter(): void {
  for (const { veilleur } of veilleurs.values()) void veilleur.close()
  veilleurs.clear()
}
