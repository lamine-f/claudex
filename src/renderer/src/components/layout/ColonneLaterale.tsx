import { useMemo } from 'react'
import { useStore } from '@renderer/state/store'
import { FileTree } from '../files/FileTree'
import {
  IconeArborescence,
  IconeConversations,
  IconeNouveauGroupe,
  IconePlus,
  IconeSynchro
} from '../ui/Icones'
import { ListeSessions } from '../workspaces/ListeSessions'

/**
 * Colonne unique portant les conversations et les fichiers.
 *
 * Les deux ne se regardent jamais en même temps : les réunir sous deux onglets
 * rend à l'agent la largeur qu'une troisième colonne lui prenait en permanence.
 */
export function ColonneLaterale(): React.JSX.Element {
  const workspaces = useStore((e) => e.workspaces)
  const actif = useStore((e) => e.activeWorkspaceId)
  const panneau = useStore((e) => e.panneau)
  const choisirPanneau = useStore((e) => e.choisirPanneau)
  const filtre = useStore((e) => e.filtre)
  const filtrer = useStore((e) => e.filtrer)
  const sessions = useStore((e) => (actif ? e.sessions[actif] : undefined))
  const chargement = useStore((e) => (actif ? e.sessionsEnCours[actif] : false))
  const chargerSessions = useStore((e) => e.chargerSessions)
  const ouvrirSession = useStore((e) => e.ouvrirSession)
  const ouvrirGroupe = useStore((e) => e.ouvrirGroupe)

  const courant = workspaces.find((w) => w.id === actif)

  // Le compte annoncé est celui des conversations, groupées ou non : c'est ce
  // que l'on cherche, pas le nombre de lignes de la colonne.
  const compte = useMemo(() => {
    const terme = filtre.trim().toLowerCase()
    if (!sessions) return undefined
    return terme ? sessions.filter((s) => s.titre.toLowerCase().includes(terme)).length : sessions.length
  }, [sessions, filtre])

  // Les deux vues se disent par leur icône : deux mots en capitales pesaient
  // plus lourd que ce qu'ils désignaient, en tête d'une colonne étroite.
  const onglet = (
    cle: 'sessions' | 'fichiers',
    libelle: string,
    icone: React.ReactNode,
    nombre?: number
  ): React.JSX.Element => (
    <button
      type="button"
      onClick={() => choisirPanneau(cle)}
      title={libelle}
      aria-label={libelle}
      aria-pressed={panneau === cle}
      className={`flex items-center gap-2 rounded-md border px-3 py-2 font-mono text-[11.5px] transition-colors ${
        panneau === cle
          ? 'border-bordure bg-fond-eleve text-texte'
          : 'border-transparent text-texte-faible hover:text-texte-doux'
      }`}
    >
      {icone}
      {nombre !== undefined && <span className="text-texte-tenu">{nombre}</span>}
    </button>
  )

  const outil = (
    libelle: string,
    icone: React.ReactNode,
    onClic: () => void,
    className = ''
  ): React.JSX.Element => (
    <button
      type="button"
      onClick={onClic}
      title={libelle}
      aria-label={libelle}
      className={`flex h-7 w-7 items-center justify-center rounded text-texte-faible transition-colors hover:bg-fond-survol hover:text-texte ${className}`}
    >
      {icone}
    </button>
  )

  return (
    <section
      aria-label="Sessions et fichiers"
      className="flex h-full min-w-0 flex-col border-r border-separateur bg-fond-panneau"
    >
      <div className="flex h-12 shrink-0 items-center gap-1.5 px-2.5">
        {onglet('sessions', 'Conversations', <IconeConversations taille={17} />, compte)}
        {onglet('fichiers', 'Fichiers', <IconeArborescence taille={17} />)}
        <div className="flex-1" />

        {panneau === 'sessions' && courant && (
          <>
            {outil(
              'Relire les conversations',
              <IconeSynchro taille={15} />,
              () => void chargerSessions(courant.id),
              chargement ? 'animate-spin' : ''
            )}
            {outil('Nouveau groupe', <IconeNouveauGroupe taille={15} />, () =>
              void ouvrirGroupe(courant.id)
            )}
            {outil(
              'Nouvelle conversation',
              <IconePlus taille={16} />,
              () => void ouvrirSession(courant.id, 'nouvelle'),
              'hover:text-accent'
            )}
          </>
        )}

        <span className="pr-1 font-mono text-[10px] text-texte-tenu">⌘E</span>
      </div>

      {!courant ? (
        <p className="px-3 py-2 text-[12.5px] text-texte-faible">Aucun projet sélectionné.</p>
      ) : panneau === 'fichiers' ? (
        <FileTree />
      ) : (
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="px-2.5 pb-2">
            <input
              type="search"
              value={filtre}
              onChange={(e) => filtrer(e.target.value)}
              placeholder="Filtrer les sessions"
              className="w-full rounded-md border border-separateur bg-fond-creux px-3 py-2 font-mono text-[12.5px] text-texte-doux placeholder:text-texte-tenu focus:border-bordure focus:outline-none"
            />
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto">
            <ListeSessions workspaceId={courant.id} />
          </div>
        </div>
      )}
    </section>
  )
}
