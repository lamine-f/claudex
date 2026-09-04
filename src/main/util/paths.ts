import { homedir } from 'node:os'
import { join, resolve, sep } from 'node:path'

/**
 * Encode un chemin absolu vers le nom de dossier utilisé par Claude Code dans
 * `~/.claude/projects/`. La règle, vérifiée sur les 16 projets de la machine ayant
 * des sessions : tout caractère non alphanumérique devient un tiret.
 *
 *   /Users/x/Workspace/Mon IDE fait maison
 *     -> -Users-x-Workspace-Mon-IDE-fait-maison
 *
 * La transformation est à sens unique et volontairement non réversible : deux chemins
 * distincts peuvent produire le même dossier. On ne l'utilise donc jamais dans l'autre
 * sens. En particulier, le champ `cwd` présent dans les transcripts n'est pas fiable
 * (il rapporte /home/... sur une machine en /Users/...), et ne doit jamais servir à
 * apparier une session à un workspace.
 */
export function encodeProjectDir(absolutePath: string): string {
  return absolutePath.replace(/[^a-zA-Z0-9-]/g, '-')
}

/** Dossier des transcripts Claude Code d'un workspace. Peut ne pas exister. */
export function claudeProjectPath(absolutePath: string): string {
  return join(claudeProjectsRoot(), encodeProjectDir(absolutePath))
}

export function claudeProjectsRoot(): string {
  return join(homedir(), '.claude', 'projects')
}

export function claudeSettingsPath(): string {
  return join(homedir(), '.claude', 'settings.json')
}

/**
 * Où l'installateur natif de Claude Code dépose son binaire.
 *
 * Il n'ajoute ce dossier au PATH qu'à la session suivante de l'utilisateur, et
 * sur Windows le PATH hérité par l'application ne le contient donc pas toujours.
 * Sans ce recours, l'écran d'état annonce Claude Code introuvable sur une machine
 * où il est installé et fonctionne.
 */
export function binaireClaude(): string {
  return join(homedir(), '.local', 'bin', process.platform === 'win32' ? 'claude.exe' : 'claude')
}

/**
 * Dossier où Claudex pose ce qu'il donne à Claude Code : le script de
 * notification, sa marque de présence, et les événements qu'il dépose.
 *
 * Il vit à côté de la configuration de Claude Code plutôt que dans les données
 * de l'application : un chemin court, sans espace, qu'un hook peut appeler sans
 * précaution de citation.
 */
export function claudexHooksDir(): string {
  return process.env.CLAUDEX_HOOKS_DIR ?? join(homedir(), '.claude', 'claudex')
}

/**
 * Forme d'un chemin destinée à la seule comparaison.
 *
 * Windows ne distingue pas la casse dans ses chemins : `C:\Projet` et
 * `c:\projet` sont le même dossier, et une comparaison exacte refusait le second
 * comme s'il sortait du workspace. Le repli en minuscules ne vaut donc que là ;
 * ailleurs, deux chemins qui ne diffèrent que par la casse désignent bien deux
 * fichiers distincts, et les confondre relâcherait le garde-fou.
 *
 * `toLowerCase` suit la table Unicode, non celle de NTFS. Les rares caractères
 * sur lesquels les deux divergent ne donnent pas d'échappatoire : un chemin
 * accepté à tort par cette comparaison désigne soit le même dossier que la
 * racine, soit un chemin qui n'existe pas.
 */
function comparable(chemin: string): string {
  return process.platform === 'win32' ? chemin.toLowerCase() : chemin
}

/**
 * Garde-fou : refuse tout chemin qui sort des workspaces enregistrés. Appelé par
 * chaque opération de lecture de fichier exposée au renderer.
 *
 * Le chemin rendu garde sa casse d'origine : c'est lui qui sert ensuite à ouvrir
 * le fichier, et le rendre en minuscules donnerait un chemin trompeur à lire.
 */
export function assertInsideWorkspace(target: string, workspaceRoots: string[]): string {
  const resolved = resolve(target)
  const compare = comparable(resolved)
  const allowed = workspaceRoots.some((root) => {
    const base = comparable(resolve(root))
    return compare === base || compare.startsWith(base.endsWith(sep) ? base : base + sep)
  })
  if (!allowed) {
    throw new Error(`Chemin hors des workspaces autorisés : ${resolved}`)
  }
  return resolved
}

/** Nom de session tmux : alphanumérique et underscore uniquement.
 *  tmux traite `.` et `:` comme des séparateurs de cible, ils sont donc exclus. */
export function tmuxSessionName(workspaceId: string, tabId: string): string {
  const clean = (s: string) => s.replace(/[^a-zA-Z0-9]/g, '')
  return `cdx_${clean(workspaceId)}_${clean(tabId)}`
}
