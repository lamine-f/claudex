/** Types partagés entre le processus main, le preload et le renderer. */

export interface Workspace {
  id: string
  /** Chemin absolu du dossier. C'est l'identité réelle du workspace. */
  path: string
  /** Nom affiché, par défaut le basename du chemin. */
  name: string
  color: string
  order: number
  expanded: boolean
}

export interface Tab {
  id: string
  workspaceId: string
  title: string
  /** Répertoire de travail du terminal, mémorisé pour la recréation après reboot. */
  cwd: string
  tmuxSession: string
  /** UUID de la session Claude Code rattachée, si l'onglet en a une. */
  claudeSessionId?: string
  /** Dossier de transcripts correspondant, mémorisé pour restaurer une archive. */
  claudeProjectDir?: string
  /** Session d'origine si cet onglet est né d'un `--fork-session`. */
  forkedFrom?: string
  /** Dernière commande longue observée, proposée à la relance après reboot. */
  lastCommand?: string
  /**
   * Commande à jouer une seule fois, à la création de la session tmux — typiquement
   * `claude -r <uuid>`. Effacée dès qu'elle a été envoyée, pour ne pas être rejouée
   * à chaque réattachement.
   */
  commandeInitiale?: string
  lastActiveAt: number
}

export interface AppState {
  workspaces: Workspace[]
  tabs: Tab[]
  layout: { leftWidth: number; middleWidth: number }
  activeWorkspaceId?: string
  activeTabId?: string
}

/** Une conversation Claude Code, telle que lue dans `~/.claude/projects/<dossier>/`. */
export interface ClaudeSession {
  /** UUID, qui est aussi le nom du fichier `<uuid>.jsonl`. */
  id: string
  /** Titre généré par Claude Code (`ai-title`), ou repli sur le premier prompt. */
  titre: string
  /** Vrai si le titre est un repli et non un `ai-title` d'origine. */
  titreDeRepli: boolean
  gitBranch?: string
  debutLe?: number
  misAJourLe: number
  octets: number
  epinglee: boolean
}

export type DoctorSeverity = 'ok' | 'warn' | 'error'

export interface DoctorCheck {
  id: 'tmux' | 'claude' | 'retention'
  label: string
  severity: DoctorSeverity
  detail: string
  /** Correctif applicable depuis l'écran de diagnostic, s'il en existe un. */
  fix?: { label: string; action: 'applySettingsFix' }
}
