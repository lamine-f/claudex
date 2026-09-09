import { useMemo, useState } from 'react'
import type { ServiceVu } from '@shared/types'
import { useStore } from '@renderer/state/store'
import { vueJournal } from '@renderer/state/vues'
import { raccourci } from '@renderer/systeme'
import { FileTree } from '../files/FileTree'
import { ListeChangements } from '../git/ListeChangements'
import { PanneauCommit } from '../git/PanneauCommit'
import { ListeServices } from '../services/ListeServices'
import {
  IconeArborescence,
  IconeBranche,
  IconeBranchement,
  IconeConversations,
  IconeServices,
  IconeSkill,
  IconeNouveauGroupe,
  IconePlus,
  IconeSynchro
} from '../ui/Icones'
import { ListeSessions } from '../workspaces/ListeSessions'

/**
 * Colonne unique portant les conversations, les fichiers, les services et git.
 *
 * On ne les regarde jamais ensemble : les réunir sous des onglets rend à
 * l'agent la largeur que des colonnes séparées lui prendraient en permanence.
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

  // Le nombre porté par l'onglet Services est celui de ce qui tourne, non de ce
  // qui est déclaré : c'est la question qu'on se pose en le regardant.
  const services = useStore((e) => (actif ? e.services[actif] : undefined))
  const debout = services?.filter((s) => s.etat !== 'arrete').length

  // Le nombre porté par l'onglet Git est celui des dépôts qui ont de quoi être
  // commité, non celui des fichiers : seize dépôts en portent parfois trente,
  // et c'est le nombre d'endroits où agir qui se lit d'un coup d'œil.
  const git = useStore((e) => e.git)
  const aCommiter = git?.depots.filter((d) => d.fichiers.length > 0).length || undefined
  const rafraichirGit = useStore((e) => e.rafraichirGit)

  // Le journal prend toute la place du terminal. C'est une vue : la fermer ne
  // touche pas au service, qui continue de tourner.
  const ouvrirVue = useStore((e) => e.ouvrirVue)
  const rafraichirArbre = useStore((e) => e.rafraichirArbre)

  /**
   * Ce qu'un geste vient d'écrire, le temps qu'on le lise.
   *
   * Ces deux boutons posent un fichier ailleurs que dans la vue : sans un mot,
   * cliquer ne produit rien de visible, et l'on recommence en croyant que
   * c'est resté sans effet.
   */
  const [ecrit, setEcrit] = useState<string | null>(null)

  const annoncer = async (quoi: Promise<string | null>): Promise<void> => {
    const chemin = await quoi.catch(() => null)
    setEcrit(chemin ? `écrit dans ${abreger(chemin)}` : 'rien n’a pu être écrit')
    setTimeout(() => setEcrit(null), 6000)
  }

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
    cle: 'sessions' | 'fichiers' | 'services' | 'git',
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
        {onglet('git', 'Git', <IconeBranche taille={15} />, aCommiter)}
        {onglet('services', 'Services', <IconeServices taille={16} />, debout)}
        <div className="flex-1" />
        <span className="pr-1 font-mono text-[10px] text-texte-tenu">{raccourci('E')}</span>
      </div>

      {/* Une barre par page, de même facture : le filtre à gauche, les gestes
          de la page à droite. Les gestes vivaient dans la rangée des onglets,
          où ils changeaient de place selon la page regardée, et le filtre
          n'existait que pour les conversations. */}
      {courant && (
        <div className="flex shrink-0 items-center gap-1.5 px-2.5 pb-2">
          <input
            type="search"
            value={filtre}
            onChange={(e) => filtrer(e.target.value)}
            placeholder={
              panneau === 'sessions'
                ? 'Filtrer les conversations'
                : panneau === 'fichiers'
                  ? 'Filtrer les fichiers'
                  : panneau === 'git'
                    ? 'Filtrer les changements'
                    : 'Filtrer les services'
            }
            aria-label="Filtrer"
            className="min-w-0 flex-1 rounded-md border border-separateur bg-fond-creux px-3 py-2 font-mono text-[12.5px] text-texte-doux placeholder:text-texte-tenu focus:border-bordure focus:outline-none"
          />

          {panneau === 'sessions' && (
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

          {panneau === 'fichiers' &&
            outil('Relire l’arborescence', <IconeSynchro taille={15} />, () =>
              void rafraichirArbre(courant.path)
            )}

          {panneau === 'services' && (
            <>
              {outil('Écrire le skill des services', <IconeSkill taille={15} />, () =>
                void annoncer(window.claudex.services.skill(courant.id))
              )}
              {/* Le skill dit aux agents où lire ; le serveur MCP leur laisse
                  agir. Relancer un service à la main en ferait tourner deux. */}
              {outil(
                'Brancher les agents sur Claudex, pour tous les projets',
                <IconeBranchement taille={15} />,
                () => void annoncer(window.claudex.services.mcp(courant.id, 'utilisateur'))
              )}
            </>
          )}

          {panneau === 'git' &&
            outil('Relire l’état des dépôts', <IconeSynchro taille={15} />, () =>
              void rafraichirGit()
            )}
        </div>
      )}

      {ecrit && (
        <p
          aria-live="polite"
          className="shrink-0 truncate px-2.5 pb-1.5 font-mono text-[10.5px] text-texte-tenu"
        >
          {ecrit}
        </p>
      )}

      {!courant ? (
        <p className="px-3 py-2 text-[12.5px] text-texte-faible">Aucun projet sélectionné.</p>
      ) : panneau === 'fichiers' ? (
        <FileTree />
      ) : panneau === 'git' ? (
        // La liste défile, le panneau de commit reste sous la main : on écrit
        // son message sans avoir à redescendre au bas de trente fichiers.
        <>
          <div className="min-h-0 flex-1 overflow-y-auto">
            <ListeChangements workspaceId={courant.id} />
          </div>
          <PanneauCommit workspaceId={courant.id} />
        </>
      ) : panneau === 'services' ? (
        <div className="min-h-0 flex-1 overflow-y-auto">
          <ListeServices workspaceId={courant.id} onVoirJournal={(service) => ouvrirVue(courant.id, vueJournal(service))} />
        </div>
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto">
          <ListeSessions workspaceId={courant.id} />
        </div>
      )}
    </section>
  )
}

/** Un chemin dit court : la maison en `~`, et le reste tel quel. */
function abreger(chemin: string): string {
  const maison = /^(\/Users\/[^/]+|\/home\/[^/]+|[A-Z]:\\Users\\[^\\]+)/.exec(chemin)?.[0]
  return maison ? `~${chemin.slice(maison.length)}` : chemin
}
