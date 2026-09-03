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
  /**
   * Noms donnés à la main, par identifiant de conversation.
   *
   * Ils priment sur le titre que Claude Code génère : quand on a nommé une
   * bifurcation « piste sans cache », c'est ce nom qui dit ce qu'on y explore,
   * pas le résumé automatique des premiers échanges.
   */
  nomsSessions?: Record<string, string>

  /**
   * Étiquettes personnelles, par identifiant de conversation.
   *
   * Un mot posé à côté du titre pour distinguer ce que le titre confond : deux
   * conversations nommées « Hello world » par Claude Code sont indiscernables
   * sans lui.
   */
  etiquettes?: Record<string, string>
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
  /** Mot posé à la main à côté du titre, pour distinguer deux homonymes. */
  etiquette?: string
  gitBranch?: string
  debutLe?: number
  misAJourLe: number
  octets: number
  epinglee: boolean
}

export type DoctorSeverity = 'ok' | 'warn' | 'error'

export interface DoctorCheck {
  id: 'tmux' | 'claude' | 'retention' | 'pont'
  label: string
  severity: DoctorSeverity
  detail: string
  /** Correctif applicable depuis l'écran de diagnostic, s'il en existe un. */
  fix?: { label: string; action: 'applySettingsFix' }
}

/** Une entrée de l'arborescence de fichiers. */
export interface Entree {
  nom: string
  chemin: string
  dossier: boolean
  octets: number
  /** Vrai pour les entrées masquées par convention (nom commençant par un point). */
  discrete: boolean
}

/**
 * Aperçu d'un fichier. Les deux cas de refus sont explicites plutôt que silencieux :
 * l'utilisateur doit savoir pourquoi il ne voit pas son fichier.
 */
export type Apercu =
  | { type: 'texte'; contenu: string; langage: string; octets: number }
  | { type: 'trop-gros'; octets: number }
  | { type: 'binaire'; octets: number }

/** État git d'un projet, réduit à ce que la barre de statut affiche. */
export interface EtatGit {
  branche: string
  modifies: number
  nonSuivis: number
}

/**
 * Où en est une conversation.
 *
 * `active` désigne celle qu'on a sous les yeux, `ouverte` celles qui attendent
 * dans un autre onglet : les confondre laissait croire que plusieurs
 * conversations tournaient de front.
 *
 * `attente` et `interrompue` demandent de savoir ce que fait l'agent : ils
 * viendront des hooks de Claude Code, et jusque-là aucune session ne les porte.
 */
export type StatutSession = 'active' | 'ouverte' | 'attente' | 'interrompue' | 'terminee'
