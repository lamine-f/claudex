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

/** Le PATH que le système donne à une application lancée depuis le Dock. */
const MAIGRE = '/usr/bin:/bin:/usr/sbin:/sbin'

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
 * Rien n'est fait si le PATH reçu porte déjà autre chose que le strict
 * nécessaire : interroger le shell coûte quelques centaines de millisecondes au
 * démarrage, et n'a d'intérêt que dans le cas maigre.
 */
export function completerChemin(): void {
  if (process.platform === 'win32') return
  const actuel = process.env.PATH ?? ''
  if (actuel !== MAIGRE && actuel !== `${MAIGRE}:`) return

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
