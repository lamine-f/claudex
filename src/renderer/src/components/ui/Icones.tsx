import {
  Columns2,
  FilePen,
  FilePlus,
  FolderTree,
  MessagesSquare,
  PanelLeft,
  GitBranch,
  GitFork,
  Plus,
  RefreshCw,
  Sparkles,
  SquareTerminal,
  Star,
  X
} from 'lucide-react'

/**
 * Icônes de l'interface.
 *
 * Reprises de Lucide plutôt que dessinées à la main : un jeu entretenu tient
 * une cohérence de trait et d'optique qu'un dessin au cas par cas n'atteint
 * pas. Le trait est affiné à 1,5 pour une interface dense où les icônes ne
 * doivent jamais peser plus que le texte qu'elles accompagnent.
 */
const TRAIT = 1.5
const TAILLE = 13

interface Props {
  taille?: number
  className?: string
}

const reglages = ({ taille = TAILLE, className }: Props): Record<string, unknown> => ({
  size: taille,
  strokeWidth: TRAIT,
  absoluteStrokeWidth: true,
  className
})

/** Branche git courante. */
export const IconeBranche = (p: Props): React.JSX.Element => <GitBranch {...reglages(p)} />

/** Fichier suivi et modifié. */
export const IconeModifie = (p: Props): React.JSX.Element => <FilePen {...reglages(p)} />

/** Fichier que git ne suit pas encore. */
export const IconeNonSuivi = (p: Props): React.JSX.Element => <FilePlus {...reglages(p)} />

/** Multiplexeur de terminal. */
export const IconeTerminal = (p: Props): React.JSX.Element => <SquareTerminal {...reglages(p)} />

/** Claude Code. */
export const IconeEtincelle = (p: Props): React.JSX.Element => <Sparkles {...reglages(p)} />

/** Bifurquer une conversation. */
export const IconeBifurquer = (p: Props): React.JSX.Element => <GitFork {...reglages(p)} />

/** Conversation mise en favori. */
export const IconeFavori = (p: Props): React.JSX.Element => <Star {...reglages(p)} />

/** Relire la liste. */
export const IconeSynchro = (p: Props): React.JSX.Element => <RefreshCw {...reglages(p)} />

/** Ajouter. */
export const IconePlus = (p: Props): React.JSX.Element => <Plus {...reglages(p)} />

/** Fermer. */
export const IconeFermer = (p: Props): React.JSX.Element => <X {...reglages(p)} />

/** Les conversations d'un projet. */
export const IconeConversations = (p: Props): React.JSX.Element => (
  <MessagesSquare {...reglages(p)} />
)

/** L'arborescence des fichiers. */
export const IconeArborescence = (p: Props): React.JSX.Element => <FolderTree {...reglages(p)} />

/** Replier ou déployer la colonne des projets. */
export const IconePanneauProjets = (p: Props): React.JSX.Element => <PanelLeft {...reglages(p)} />

/** Replier ou déployer la colonne des conversations et des fichiers. */
export const IconePanneauColonne = (p: Props): React.JSX.Element => <Columns2 {...reglages(p)} />
