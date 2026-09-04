import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { promisify } from 'node:util'
import type { IPty } from 'node-pty'
import type { Amorce, InfoSession, Multiplexeur } from './types'

const run = promisify(execFile)

// node-pty est un module natif : il doit être chargé en CommonJS depuis le main.
const require_ = createRequire(import.meta.url)
const nodePty = require_('node-pty') as typeof import('node-pty')

/**
 * Configuration du serveur tmux de Claudex.
 *
 * Embarquée dans le code plutôt que lue depuis un fichier de ressources : selon
 * la manière dont Electron est lancé — développement, application empaquetée,
 * test de bout en bout — le chemin des ressources change, et une configuration
 * introuvable se traduisait par la barre de statut de tmux au bas de l'interface,
 * sans le moindre message.
 */
export const CONFIGURATION = `# Configuration tmux dédiée à Claudex.
# Chargée via \`tmux -L claudex -f <ce fichier>\` : le socket et la conf sont isolés,
# les sessions tmux personnelles de l'utilisateur ne sont ni lues ni modifiées.

# L'app dessine sa propre UI : la barre de statut de tmux ferait doublon.
set -g status off

set -g mouse on
set -g history-limit 100000
set -g escape-time 0
set -g focus-events on
set -g default-terminal "tmux-256color"
set -ga terminal-overrides ",xterm-256color:Tc"

# Passthrough des séquences OSC : Claude Code s'en sert (titres, hyperliens, presse-papiers).
set -g allow-passthrough on
set -g set-clipboard on

# Un seul client par session : la taille suit la fenêtre de l'app sans compromis.
setw -g aggressive-resize on

# Une session détruite ne doit pas entraîner la fermeture des autres clients.
set -g detach-on-destroy off

# Numérotation à partir de 1, plus lisible quand on inspecte avec \`tmux -L claudex ls\`.
set -g base-index 1
setw -g pane-base-index 1
`

/**
 * Socket dédié : les sessions personnelles de l'utilisateur, sur le socket par
 * défaut, ne sont ni listées ni modifiées par Claudex.
 *
 * Il est surchargeable pour que les tests travaillent sur leur propre serveur :
 * partager le socket de l'application revenait à tuer les sessions de
 * l'utilisateur au premier `kill-server` d'une suite de tests.
 */
export const SOCKET = process.env.CLAUDEX_TMUX_SOCKET ?? 'claudex'

let cheminConf = ''

/**
 * Fixe le chemin de la configuration tmux embarquée. Appelé une fois au démarrage
 * par le processus main ; l'injecter plutôt que de le déduire d'`app` garde ce
 * service testable hors d'Electron.
 */
/**
 * Écrit la configuration dans `dossier` et l'adopte. À appeler une fois au
 * démarrage, avant toute création de session.
 */
export async function preparerConfiguration(dossier: string): Promise<string> {
  await mkdir(dossier, { recursive: true })
  const chemin = join(dossier, 'tmux.conf')
  await writeFile(chemin, CONFIGURATION, 'utf8')
  cheminConf = chemin
  return chemin
}

/** Adopte une configuration déjà écrite — utile aux tests. */
export function configurer(chemin: string): void {
  cheminConf = chemin
  if (!existsSync(chemin)) console.error(`[tmux] configuration introuvable : ${chemin}`)
}

/**
 * Applique la configuration au serveur en place.
 *
 * L'option `-f` n'est lue qu'au démarrage du serveur tmux : si celui-ci tournait
 * déjà — lancé par une session précédente, un test, ou un plantage antérieur —
 * les réglages seraient purement et simplement ignorés, et la barre de statut de
 * tmux réapparaîtrait au bas de l'interface.
 */
async function appliquerConfiguration(): Promise<void> {
  if (!cheminConf || !existsSync(cheminConf)) return
  try {
    await tmux('source-file', cheminConf)
  } catch (erreur) {
    console.error('[tmux] configuration non appliquée :', erreur)
  }
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
  const amorce = commandeInitiale ? [`${commandeInitiale}; exec ${shell} -l`] : []

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
    if (String(erreur).includes('duplicate session')) {
      await appliquerConfiguration()
      return { preexistante: true }
    }
    throw erreur
  }

  await appliquerConfiguration()
  return { preexistante: false }
}

export async function killSession(nom: string): Promise<void> {
  try {
    await tmux('kill-session', '-t', `=${nom}`)
  } catch {
    // Session déjà absente : le résultat voulu est atteint.
  }
}

/** Protège une chaîne destinée à une ligne de commande shell. */
export function proteger(valeur: string): string {
  return `'${valeur.replaceAll("'", `'\\''`)}'`
}

/** Envoie des touches dans la fenêtre active de la session. */
export async function sendKeys(nom: string, ...touches: string[]): Promise<void> {
  await tmux('send-keys', '-t', ciblePane(nom), ...touches)
}

/**
 * Arguments d'attachement, passés tels quels à node-pty.
 *
 * `-d` détache les autres clients de la session. Le modèle de Claudex est d'un
 * client par onglet ; sans cette garantie, un client resté en vie — pty orphelin,
 * réattachement concurrent — recevrait aussi l'écho de tmux et chaque caractère
 * s'afficherait en double.
 */
export function attachArgs(nom: string): string[] {
  return [...argsBase(), '-u', 'attach-session', '-d', '-t', `=${nom}`]
}

/** Contenu visible et historique du pane, séquences ANSI comprises (`-e`). */
export async function capturePane(nom: string, lignes = 5000): Promise<string> {
  try {
    return await tmux('capture-pane', '-p', '-e', '-J', '-S', `-${lignes}`, '-t', ciblePane(nom))
  } catch {
    return ''
  }
}

export async function paneInfo(nom: string): Promise<InfoSession | null> {
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

/**
 * Assemble l'amorce en une seule ligne de shell.
 *
 * L'écran d'avant passe par un `cat` joué dans la session plutôt que par une
 * écriture dans xterm : tmux efface l'écran à l'arrivée d'un client et
 * emporterait tout. Passer par la session met le contenu dans l'historique de
 * tmux, où il reste consultable et défilable.
 */
function composer(amorce?: Amorce): string | undefined {
  const morceaux: string[] = []
  if (amorce?.ecranPrecedent) morceaux.push(`cat -- ${proteger(amorce.ecranPrecedent)}`)
  if (amorce?.commande) morceaux.push(amorce.commande)
  return morceaux.length ? morceaux.join('; ') : undefined
}

/**
 * Le pilote tmux, tel que le reste de l'application le voit.
 *
 * Il ne fait qu'habiller les fonctions ci-dessus : le comportement sur macOS
 * est celui d'avant le portage, à la lettre.
 */
export const pilote: Multiplexeur = {
  nom: 'tmux',
  persistant: true,

  async preparerConfiguration(dossier) {
    await preparerConfiguration(dossier)
  },

  async version() {
    try {
      const { stdout } = await run('tmux', ['-V'], { timeout: 5000 })
      return stdout.trim().match(/\d[\w.-]*/)?.[0] ?? null
    } catch {
      return null
    }
  },

  existe: hasSession,

  assurer: (nom, cwd, cols, rows, amorce) =>
    ensureSession(nom, cwd, cols, rows, composer(amorce)),

  detruire: killSession,

  attacher: (nom, cols, rows): IPty =>
    nodePty.spawn('tmux', attachArgs(nom), {
      name: 'xterm-256color',
      cols: Math.max(cols, 20),
      rows: Math.max(rows, 5),
      cwd: process.env.HOME,
      env: {
        ...process.env,
        TERM: 'xterm-256color',
        COLORTERM: 'truecolor'
      }
    }),

  // Le pty n'est qu'un client de la session : le tuer détache, il ne détruit rien.
  detacher: (processus) => {
    try {
      processus.kill()
    } catch {
      /* déjà mort */
    }
  },

  capturer: capturePane,
  info: paneInfo,
  commandeComplete: (info) => commandeComplete(info.tty),
  proteger
}
