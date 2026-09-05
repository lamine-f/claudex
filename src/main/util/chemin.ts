import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

/**
 * Endroits où un outil se trouve d'ordinaire, quand le PATH ne le dit pas.
 *
 * Homebrew d'abord, qui installe tmux sur les Mac Apple Silicon, puis les
 * emplacements classiques. `~/.local/bin` porte le CLI de Claude Code.
 */
const HABITUELS = ['/opt/homebrew/bin', '/usr/local/bin', '/usr/bin', '/bin', '/usr/sbin', '/sbin']

/**
 * Ce que Claudex ne peut pas trouver tout seul, et sans quoi il ne fait rien.
 *
 * `tmux` porte les terminaux, `claude` les conversations. Leur absence du PATH
 * est le signe qu'il est trop maigre, et c'est un signe plus sûr que la forme du
 * PATH lui-même.
 */
const REQUIS = ['tmux', 'claude']

function dossiers(chemin: string | undefined): string[] {
  return (chemin ?? '').split(':').filter(Boolean)
}

/** Réunit deux listes de dossiers sans doublon, en gardant l'ordre du premier. */
export function fusionner(actuel: string | undefined, ajouts: string[]): string {
  const vus = new Set<string>()
  const retenus: string[] = []
  for (const dossier of [...dossiers(actuel), ...ajouts]) {
    if (vus.has(dossier)) continue
    vus.add(dossier)
    retenus.push(dossier)
  }
  return retenus.join(':')
}

/**
 * Le PATH tel que le shell de connexion le construit.
 *
 * Interrogé par un shell interactif de connexion, parce que c'est là que les
 * réglages de l'utilisateur vivent : `.zprofile` pour les uns, `.zshrc` pour
 * les autres, et Homebrew écrit dans l'un ou dans l'autre selon l'installation.
 */
function chemainDuShell(): string[] {
  const shell = process.env.SHELL
  if (!shell) return []
  try {
    const sortie = execFileSync(shell, ['-ilc', 'command -p echo "$PATH"'], {
      encoding: 'utf8',
      timeout: 3000,
      stdio: ['ignore', 'pipe', 'ignore']
    })
    return dossiers(sortie.trim().split('\n').at(-1))
  } catch {
    return []
  }
}

/**
 * Rend à l'application le PATH de l'utilisateur.
 *
 * Lancée depuis le Dock ou le Finder, une application macOS n'hérite pas de
 * l'environnement d'un terminal : son PATH se réduit à quatre dossiers du
 * système. `tmux`, installé par Homebrew dans `/opt/homebrew/bin`, y est donc
 * introuvable, et le premier terminal reste sur « démarrage du terminal… »
 * pour toujours. Le CLI de Claude Code, dans `~/.local/bin`, disparaît de la
 * même façon, et l'écran d'état le déclare absent alors qu'il est installé.
 *
 * Le défaut ne se voit pas en développement, où l'application est lancée depuis
 * un terminal et hérite d'un PATH complet. C'est ce qui l'a laissé passer.
 *
 * Rien n'est fait tant que tmux et claude sont atteignables : interroger le
 * shell coûte quelques centaines de millisecondes au démarrage, et n'a d'intérêt
 * que lorsqu'il manque quelque chose.
 *
 * Le manque se lit sur les outils, et non sur la forme du PATH. La première
 * version comparait celui-ci à la chaîne exacte que macOS donne au Dock, ce qui
 * ne pouvait rien attraper ailleurs : le menu de GNOME donne un PATH bien plus
 * riche, mesuré sur Debian 13, et l'égalité échouait donc toujours. Un PATH
 * pauvre autrement — la même liste privée de `~/.local/bin`, ce qu'on obtient
 * quand la session ne lit pas `~/.profile` — laissait `claude` introuvable sans
 * que rien ne s'en émeuve.
 *
 * Le prix de ce choix est qu'un outil réellement absent de la machine fait
 * interroger le shell à chaque démarrage. C'est le seul cas où chercher a un
 * sens, et l'écran d'état dit alors quoi installer.
 */
export function completerChemin(): void {
  if (process.platform === 'win32') return
  const actuel = process.env.PATH ?? ''
  if (REQUIS.every(trouvable)) return

  process.env.PATH = fusionner(actuel, [
    ...chemainDuShell(),
    ...HABITUELS,
    join(homedir(), '.local', 'bin'),
    join(homedir(), 'bin')
  ])
}

/** Vrai si un exécutable de ce nom est atteignable dans le PATH courant. */
export function trouvable(nom: string): boolean {
  return dossiers(process.env.PATH).some((dossier) => existsSync(join(dossier, nom)))
}
