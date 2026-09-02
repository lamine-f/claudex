import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const run = promisify(execFile)

/** Socket dédié : les sessions personnelles de l'utilisateur, sur le socket par
 *  défaut, ne sont ni listées ni modifiées par Claudex. */
export const SOCKET = 'claudex'

let cheminConf = ''

/**
 * Fixe le chemin de la configuration tmux embarquée. Appelé une fois au démarrage
 * par le processus main ; l'injecter plutôt que de le déduire d'`app` garde ce
 * service testable hors d'Electron.
 */
export function configurer(chemin: string): void {
  cheminConf = chemin
}

/** Arguments communs à toute invocation : socket et configuration isolés. */
export function argsBase(): string[] {
  return ['-L', SOCKET, '-f', cheminConf]
}

async function tmux(...args: string[]): Promise<string> {
  const { stdout } = await run('tmux', [...argsBase(), ...args], {
    timeout: 10_000,
    maxBuffer: 32 * 1024 * 1024 // capture-pane d'un gros scrollback
  })
  return stdout
}

/**
 * Cible désignant la fenêtre active d'une session, pour les commandes qui opèrent
 * sur un pane. Le préfixe `=` force la correspondance exacte du nom, et les deux
 * points sont indispensables : sans eux, tmux interprète la chaîne comme un nom de
 * pane et répond « can't find pane ».
 */
function ciblePane(nom: string): string {
  return `=${nom}:`
}

export async function hasSession(nom: string): Promise<boolean> {
  try {
    await tmux('has-session', '-t', `=${nom}`)
    return true
  } catch {
    return false
  }
}

/**
 * Crée la session détachée si elle n'existe pas déjà, et renvoie `true` quand elle
 * préexistait — c'est ce qui distingue une reprise (tmux a survécu à la fermeture de
 * l'app) d'une création à froid (après un redémarrage de la machine).
 */
export async function ensureSession(
  nom: string,
  cwd: string,
  cols: number,
  rows: number,
  commandeInitiale?: string
): Promise<{ preexistante: boolean }> {
  if (await hasSession(nom)) return { preexistante: true }

  // La commande d'amorçage fait partie du lancement de la session, elle n'est pas
  // « tapée » ensuite : un shell affiche son invite avant d'être prêt à lire son
  // entrée, et avalerait silencieusement une frappe envoyée trop tôt.
  // `exec $SHELL -l` rend la main à un shell interactif quand la commande se
  // termine, pour que la session survive à la sortie de l'agent.
  const shell = process.env.SHELL ?? '/bin/zsh'
  const amorce = commandeInitiale
    ? [`${commandeInitiale}; exec ${shell} -l`]
    : []

  try {
    await tmux(
      'new-session',
      '-d',
      '-s',
      nom,
      '-c',
      cwd,
      '-x',
      String(Math.max(cols, 20)),
      '-y',
      String(Math.max(rows, 5)),
      ...amorce
    )
  } catch (erreur) {
    // Deux ouvertures concurrentes du même onglet peuvent franchir le test
    // d'existence avant que l'une n'ait créé la session. tmux tranche alors
    // lui-même : le perdant reçoit « duplicate session », ce qui est exactement
    // le résultat recherché.
    if (String(erreur).includes('duplicate session')) return { preexistante: true }
    throw erreur
  }
  return { preexistante: false }
}

export async function killSession(nom: string): Promise<void> {
  try {
    await tmux('kill-session', '-t', `=${nom}`)
  } catch {
    // Session déjà absente : le résultat voulu est atteint.
  }
}

/** Envoie des touches dans la fenêtre active de la session. */
export async function sendKeys(nom: string, ...touches: string[]): Promise<void> {
  await tmux('send-keys', '-t', ciblePane(nom), ...touches)
}

/** Arguments d'attachement, passés tels quels à node-pty. */
export function attachArgs(nom: string): string[] {
  return [...argsBase(), '-u', 'attach-session', '-t', `=${nom}`]
}

/** Contenu visible et historique du pane, séquences ANSI comprises (`-e`). */
export async function capturePane(nom: string, lignes = 5000): Promise<string> {
  try {
    return await tmux('capture-pane', '-p', '-e', '-J', '-S', `-${lignes}`, '-t', ciblePane(nom))
  } catch {
    return ''
  }
}

export interface PaneInfo {
  cwd: string
  /** Nom du processus au premier plan : `zsh`, `node`, `claude`… */
  commande: string
  /** Terminal du pane, qui permet de retrouver la ligne de commande complète. */
  tty: string
}

export async function paneInfo(nom: string): Promise<PaneInfo | null> {
  try {
    const sortie = await tmux(
      'display-message',
      '-p',
      '-t',
      ciblePane(nom),
      '#{pane_current_path}\t#{pane_current_command}\t#{pane_tty}'
    )
    const [cwd, commande, tty] = sortie.trim().split('\t')
    if (!cwd) return null
    return { cwd, commande: commande ?? '', tty: tty ?? '' }
  } catch {
    return null
  }
}

/**
 * Ligne de commande complète du processus au premier plan du pane.
 * `#{pane_current_command}` ne donne que le nom de l'exécutable ; pour proposer une
 * relance utile après un reboot, il faut les arguments — d'où le passage par `ps`.
 */
export async function commandeComplete(tty: string): Promise<string | null> {
  if (!tty) return null
  try {
    const { stdout } = await run('ps', ['-t', tty.replace('/dev/', ''), '-o', 'command='], {
      timeout: 5000
    })
    const lignes = stdout
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean)
      // Le shell lui-même n'est pas une commande à relancer.
      .filter((l) => !/^-?(zsh|bash|sh|fish)\b/.test(l))
    return lignes.at(-1) ?? null
  } catch {
    return null
  }
}

/** Vrai si le serveur tmux du socket Claudex répond. */
export async function serveurVivant(): Promise<boolean> {
  try {
    await tmux('list-sessions')
    return true
  } catch {
    return false
  }
}
