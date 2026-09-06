import type { IDisposable, IPty } from 'node-pty'
import { multiplexeur } from './multiplexeur'

/**
 * Ce que le gestionnaire attend de sa destination. `WebContents` d'Electron y
 * répond tel quel ; l'exprimer ainsi permet de tester le service sans fenêtre.
 */
export interface Destinataire {
  send(canal: string, ...args: unknown[]): void
  isDestroyed(): boolean
}

interface Attache {
  processus: IPty
  /** Le nom de la session, que le pilote demande pour tout ce qui la concerne. */
  session: string
  destinataire: Destinataire
  /**
   * Les écouteurs sont retenus pour être défaits au détachement.
   *
   * Avec tmux, détacher tuait le pty et emportait ses écouteurs avec lui. Le
   * pilote Windows, lui, garde le même processus d'un onglet à l'autre : sans
   * cette libération, chaque réattachement ajouterait un écouteur de plus et la
   * sortie du terminal s'afficherait en double, puis en triple.
   */
  ecouteurs: IDisposable[]
}

const attaches = new Map<string, Attache>()

/**
 * Branche un onglet sur sa session et pousse la sortie vers le renderer.
 *
 * Ce que le pty représente dépend du pilote : un client tmux d'un côté, le shell
 * lui-même de l'autre. Le registre n'a pas à le savoir.
 */
export function attach(
  tabId: string,
  session: string,
  cols: number,
  rows: number,
  destinataire: Destinataire
): void {
  detach(tabId)

  const processus = multiplexeur.attacher(session, cols, rows)

  const ecouteurs = [
    processus.onData((donnees) => {
      if (!destinataire.isDestroyed()) destinataire.send('term:data', tabId, donnees)
    }),
    processus.onExit(({ exitCode }) => {
      // Ne retirer l'entrée que si elle désigne encore CE processus.
      //
      // `kill()` est asynchrone : quand un onglet se rattache, la sortie de
      // l'ancien pty survient après l'enregistrement du nouveau. Supprimer
      // aveuglément effaçait donc le nouveau du registre — le terminal continuait
      // d'afficher, puisque la sortie remonte par une autre voie, mais plus rien
      // ne pouvait lui être écrit. Le clavier semblait mort.
      if (attaches.get(tabId)?.processus !== processus) return
      attaches.delete(tabId)
      if (!destinataire.isDestroyed()) destinataire.send('term:exit', tabId, exitCode)
    })
  ]

  attaches.set(tabId, { processus, session, destinataire, ecouteurs })
}

export function write(tabId: string, donnees: string): void {
  attaches.get(tabId)?.processus.write(donnees)
}

export function resize(tabId: string, cols: number, rows: number): void {
  const attache = attaches.get(tabId)
  if (!attache) return
  try {
    // Par le pilote, et non par le pty : ce qu'il faut redimensionner en plus
    // du processus lui appartient.
    multiplexeur.redimensionner(attache.session, attache.processus, cols, rows)
  } catch {
    // Le pty peut disparaître entre le redimensionnement et son traitement.
  }
}

/** Défait le branchement de l'onglet. Ce qu'il advient de la session tient au pilote. */
export function detach(tabId: string): void {
  const attache = attaches.get(tabId)
  if (!attache) return
  attaches.delete(tabId)
  for (const ecouteur of attache.ecouteurs) ecouteur.dispose()
  multiplexeur.detacher(attache.processus)
}

/** Processus actuellement attaché à un onglet, s'il y en a un. */
export function processusDe(tabId: string): unknown {
  return attaches.get(tabId)?.processus
}

export function detachAll(): void {
  for (const tabId of [...attaches.keys()]) detach(tabId)
}

export function estAttache(tabId: string): boolean {
  return attaches.has(tabId)
}
