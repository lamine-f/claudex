import { createRequire } from 'node:module'
import { attachArgs } from './tmux'

/**
 * Ce que le gestionnaire attend de sa destination. `WebContents` d'Electron y
 * répond tel quel ; l'exprimer ainsi permet de tester le service sans fenêtre.
 */
export interface Destinataire {
  send(canal: string, ...args: unknown[]): void
  isDestroyed(): boolean
}

// node-pty est un module natif : il doit être chargé en CommonJS depuis le main.
const require_ = createRequire(import.meta.url)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const pty = require_('node-pty') as typeof import('node-pty')

interface Attache {
  processus: import('node-pty').IPty
  destinataire: Destinataire
}

const attaches = new Map<string, Attache>()

/**
 * Attache un pty à une session tmux existante et pousse sa sortie vers le renderer.
 * Le pty n'est qu'un client : le tuer détache, il ne détruit pas la session.
 */
export function attach(
  tabId: string,
  sessionTmux: string,
  cols: number,
  rows: number,
  destinataire: Destinataire
): void {
  detach(tabId)

  const processus = pty.spawn('tmux', attachArgs(sessionTmux), {
    name: 'xterm-256color',
    cols: Math.max(cols, 20),
    rows: Math.max(rows, 5),
    cwd: process.env.HOME,
    env: {
      ...process.env,
      TERM: 'xterm-256color',
      COLORTERM: 'truecolor'
    }
  })

  processus.onData((donnees) => {
    if (!destinataire.isDestroyed()) destinataire.send('term:data', tabId, donnees)
  })

  processus.onExit(({ exitCode }) => {
    // Ne retirer l'entrée que si elle désigne encore CE processus.
    //
    // `kill()` est asynchrone : quand un onglet se rattache, la sortie de l'ancien
    // pty survient après l'enregistrement du nouveau. Supprimer aveuglément
    // effaçait donc le nouveau du registre — le terminal continuait d'afficher,
    // puisque la sortie remonte par une autre voie, mais plus rien ne pouvait lui
    // être écrit. Le clavier semblait mort.
    if (attaches.get(tabId)?.processus !== processus) return
    attaches.delete(tabId)
    if (!destinataire.isDestroyed()) destinataire.send('term:exit', tabId, exitCode)
  })

  attaches.set(tabId, { processus, destinataire })
}

export function write(tabId: string, donnees: string): void {
  attaches.get(tabId)?.processus.write(donnees)
}

export function resize(tabId: string, cols: number, rows: number): void {
  const attache = attaches.get(tabId)
  if (!attache) return
  try {
    attache.processus.resize(Math.max(cols, 20), Math.max(rows, 5))
  } catch {
    // Le pty peut disparaître entre le redimensionnement et son traitement.
  }
}

/** Détache le client sans toucher à la session tmux, qui continue de vivre. */
export function detach(tabId: string): void {
  const attache = attaches.get(tabId)
  if (!attache) return
  attaches.delete(tabId)
  try {
    attache.processus.kill()
  } catch {
    /* déjà mort */
  }
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
