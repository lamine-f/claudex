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
 * Garde-fou : refuse tout chemin qui sort des workspaces enregistrés. Appelé par
 * chaque opération de lecture de fichier exposée au renderer.
 */
export function assertInsideWorkspace(target: string, workspaceRoots: string[]): string {
  const resolved = resolve(target)
  const allowed = workspaceRoots.some((root) => {
    const base = resolve(root)
    return resolved === base || resolved.startsWith(base.endsWith(sep) ? base : base + sep)
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
