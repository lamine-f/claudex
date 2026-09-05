import { useMemo, useState } from 'react'
import type { ClaudeSession, StatutSession } from '@shared/types'
import { RANGEMENT_VIDE, assembler, type Cible, type Element, type Ligne } from '@shared/rangement'
import { useStore } from '@renderer/state/store'
import { EnteteGroupe } from './EnteteGroupe'
import { MenuContextuel, type Action } from '../ui/MenuContextuel'
import { SessionRow } from './SessionRow'

/** Nombre de lignes montrées avant d'avoir à dérouler le reste. */
const APERCU = 10

/** Ce qui est survolé pendant un déplacement, et à quelle hauteur de la ligne. */
interface Survol {
  cle: string
  position: 'avant' | 'dans' | 'apres'
}

/**
 * La liste des conversations d'un projet, telle qu'on l'a rangée.
 *
 * L'ordre du disque — favoris en tête, puis les plus récentes — ne dit pas ce
 * qui va avec quoi. On déplace donc les conversations à la main, et on les
 * réunit en groupes nommés ; ce classement se garde d'une session à l'autre.
 */
export function ListeSessions({ workspaceId }: { workspaceId: string }): React.JSX.Element {
  const sessions = useStore((e) => e.sessions[workspaceId])
  const rangement = useStore((e) => e.rangements[workspaceId]) ?? RANGEMENT_VIDE
  const chargement = useStore((e) => e.sessionsEnCours[workspaceId] ?? false)
  const tout = useStore((e) => e.toutAfficher[workspaceId] ?? false)
  const filtre = useStore((e) => e.filtre)
  const tabs = useStore((e) => e.tabs)
  const activeTabId = useStore((e) => e.activeTabId)
  const groupeANommer = useStore((e) => e.groupeANommer)
  const sollicitations = useStore((e) => e.sollicitations)

  const ouvrirSession = useStore((e) => e.ouvrirSession)
  const demanderBifurcation = useStore((e) => e.demanderBifurcation)
  const etiqueter = useStore((e) => e.etiqueter)
  const renommer = useStore((e) => e.renommer)
  const basculerFavori = useStore((e) => e.basculerFavori)
  const ecarterSession = useStore((e) => e.ecarterSession)
  const derouler = useStore((e) => e.deroulerTout)
  const deplacerElement = useStore((e) => e.deplacerElement)
  const ouvrirGroupe = useStore((e) => e.ouvrirGroupe)
  const nommerGroupe = useStore((e) => e.nommerGroupe)
  const replierGroupeSessions = useStore((e) => e.replierGroupeSessions)
  const defaireGroupe = useStore((e) => e.defaireGroupe)
  const finirNommage = useStore((e) => e.finirNommage)

  const [menu, setMenu] = useState<{ x: number; y: number; actions: Action[] } | null>(null)
  const [glisse, setGlisse] = useState<Element | null>(null)
  const [survol, setSurvol] = useState<Survol | null>(null)
  const [renomme, setRenomme] = useState<string | null>(null)

  const ouvertes = useMemo(
    () => new Set(tabs.map((t) => t.claudeSessionId).filter(Boolean)),
    [tabs]
  )
  const aLEcran = tabs.find((t) => t.id === activeTabId)?.claudeSessionId

  const lignes = useMemo(() => assembler(sessions ?? [], rangement), [sessions, rangement])

  const retenues = useMemo(() => {
    const terme = filtre.trim().toLowerCase()
    if (!terme) return lignes
    const garde = (s: ClaudeSession): boolean => s.titre.toLowerCase().includes(terme)
    return lignes.flatMap((ligne): Ligne[] => {
      if (ligne.type === 'session') return garde(ligne.session) ? [ligne] : []
      const trouvees = ligne.sessions.filter(garde)
      // Un groupe replié ne doit pas cacher ce que l'on cherche.
      return trouvees.length > 0 ? [{ ...ligne, sessions: trouvees, replie: false }] : []
    })
  }, [lignes, filtre])

  // Réarranger sous un filtre n'aurait pas de sens : l'ordre affiché n'est plus
  // celui de la liste, et « déposer ici » ne désignerait rien de sûr.
  const glissable = !filtre
  const visibles = tout || filtre ? retenues : retenues.slice(0, APERCU)
  const reste = retenues.length - visibles.length

  const statutDe = (uuid: string): StatutSession =>
    uuid === aLEcran
      ? 'active'
      : sollicitations[uuid]
        ? 'attente'
        : ouvertes.has(uuid)
          ? 'ouverte'
          : 'terminee'

  const deposer = (cible: Cible): void => {
    const quoi = glisse
    setGlisse(null)
    setSurvol(null)
    if (quoi) void deplacerElement(workspaceId, quoi, cible)
  }

  const debuter = (quoi: Element): void => {
    setGlisse(quoi)
    // Ce qui est replié derrière « N autres » doit pouvoir servir de destination.
    derouler(workspaceId)
  }

  const terminer = (): void => {
    setGlisse(null)
    setSurvol(null)
  }

  const rangeeSession = (
    session: ClaudeSession,
    conteneur: string | null,
    index: number,
    indexRacine: number
  ): React.JSX.Element => {
    const cle = `s:${session.id}`
    return (
      <SessionRow
        key={session.id}
        session={session}
        statut={statutDe(session.id)}
        glisser={
          glissable
            ? {
                enCours: glisse?.type === 'session' && glisse.id === session.id,
                indicateur:
                  survol?.cle === cle && survol.position !== 'dans' ? survol.position : undefined,
                onDebut: () => debuter({ type: 'session', id: session.id }),
                onFin: terminer,
                onSurvol: (position) => setSurvol({ cle, position }),
                onDepot: (position) =>
                  deposer({ groupe: conteneur, index: position === 'avant' ? index : index + 1 })
              }
            : undefined
        }
        onOuvrir={() => void ouvrirSession(workspaceId, 'reprise', session.id, session.titre)}
        onBifurquer={() => demanderBifurcation(workspaceId, session.id, session.titre)}
        onEtiqueter={(texte) => void etiqueter(workspaceId, session.id, texte)}
        onRenommer={(titre) => void renommer(workspaceId, session.id, titre)}
        onMenu={(x, y, editer) =>
          setMenu({
            x,
            y,
            actions: [
              {
                libelle: session.epinglee ? 'Retirer des favoris' : 'Mettre en favori',
                onChoisir: () => void basculerFavori(workspaceId, session.id, !session.epinglee)
              },
              { libelle: 'Renommer', onChoisir: () => editer('titre') },
              {
                libelle: session.etiquette ? "Changer l'étiquette" : 'Étiqueter',
                onChoisir: () => editer('etiquette')
              },
              conteneur === null
                ? {
                    libelle: 'Réunir dans un nouveau groupe…',
                    onChoisir: () =>
                      void ouvrirGroupe(workspaceId, indexRacine, [session.id])
                  }
                : {
                    libelle: 'Sortir du groupe',
                    onChoisir: () =>
                      void deplacerElement(
                        workspaceId,
                        { type: 'session', id: session.id },
                        { groupe: null, index: indexRacine }
                      )
                  },
              {
                libelle: 'Écarter la conversation…',
                ecarte: true,
                onChoisir: () => void ecarterSession(workspaceId, session)
              }
            ]
          })
        }
      />
    )
  }

  const rangeeGroupe = (ligne: Ligne & { type: 'groupe' }, index: number): React.JSX.Element => {
    const cle = `g:${ligne.id}`
    return (
      <li key={ligne.id}>
        <ul>
          <EnteteGroupe
            nom={ligne.nom}
            replie={ligne.replie}
            compte={ligne.sessions.length}
            enEdition={groupeANommer === ligne.id || renomme === ligne.id}
            onNommer={(nom) => void nommerGroupe(workspaceId, ligne.id, nom)}
            onEditer={(ouvert) => {
              setRenomme(ouvert ? ligne.id : null)
              if (ouvert) return
              finirNommage()
              // Un groupe abandonné sans nom laisserait une ligne muette : on
              // lui en donne un par défaut plutôt qu'un blanc.
              if (!ligne.nom) void nommerGroupe(workspaceId, ligne.id, '')
            }}
            onReplier={() =>
              void replierGroupeSessions(workspaceId, ligne.id, !ligne.replie)
            }
            onMenu={(x, y, editer) =>
              setMenu({
                x,
                y,
                actions: [
                  { libelle: 'Renommer le groupe', onChoisir: editer },
                  {
                    libelle: ligne.replie ? 'Déployer' : 'Replier',
                    onChoisir: () =>
                      void replierGroupeSessions(workspaceId, ligne.id, !ligne.replie)
                  },
                  {
                    libelle: 'Défaire le groupe',
                    ecarte: true,
                    onChoisir: () => void defaireGroupe(workspaceId, ligne.id)
                  }
                ]
              })
            }
            glisser={
              glissable
                ? {
                    enCours: glisse?.type === 'groupe' && glisse.id === ligne.id,
                    indicateur: survol?.cle === cle ? survol.position : undefined,
                    onDebut: () => debuter({ type: 'groupe', id: ligne.id }),
                    onFin: terminer,
                    onSurvol: (position) => setSurvol({ cle, position }),
                    onDepot: (position) =>
                      deposer(
                        position === 'dans'
                          ? { groupe: ligne.id, index: ligne.sessions.length }
                          : { groupe: null, index: position === 'avant' ? index : index + 1 }
                      )
                  }
                : undefined
            }
          />

          {!ligne.replie && (
            // Le filet vertical rattache les conversations à leur groupe : sans
            // lui, l'indentation seule ne dit pas où le groupe s'arrête.
            <li>
              <ul
                aria-label={`Conversations de ${ligne.nom || 'Sans nom'}`}
                className="ml-3.5 border-l border-separateur"
              >
                {ligne.sessions.map((session, rang) =>
                  rangeeSession(session, ligne.id, rang, index + 1)
                )}
                {ligne.sessions.length === 0 && (
                  <li
                    onDragOver={(e) => {
                      if (!glissable || !glisse) return
                      e.preventDefault()
                      setSurvol({ cle: `vide:${ligne.id}`, position: 'dans' })
                    }}
                    onDrop={(e) => {
                      e.preventDefault()
                      deposer({ groupe: ligne.id, index: 0 })
                    }}
                    className={`px-3.5 py-2.5 text-[12px] text-texte-tenu ${
                      survol?.cle === `vide:${ligne.id}` ? 'bg-fond-eleve' : ''
                    }`}
                  >
                    Groupe vide — y glisser une conversation.
                  </li>
                )}
              </ul>
            </li>
          )}
        </ul>
      </li>
    )
  }

  if (chargement && !sessions) {
    return <p className="px-3 py-2 text-[12px] text-texte-faible">Lecture des conversations…</p>
  }

  if (visibles.length === 0) {
    return (
      <p className="px-3 py-2 text-[12px] text-texte-faible">
        {filtre ? 'Aucune conversation ne correspond.' : 'aucune session ici'}
      </p>
    )
  }

  return (
    <>
      <ul>
        {visibles.map((ligne, index) =>
          ligne.type === 'session'
            ? rangeeSession(ligne.session, null, index, index)
            : rangeeGroupe(ligne, index)
        )}
        {reste > 0 && (
          <li>
            <button
              type="button"
              onClick={() => derouler(workspaceId)}
              className="w-full px-3 py-2 text-left text-[12px] text-texte-faible transition-colors hover:text-texte-doux"
            >
              ⋯ {reste} autre{reste > 1 ? 's' : ''}
            </button>
          </li>
        )}
      </ul>
      {menu && (
        <MenuContextuel
          x={menu.x}
          y={menu.y}
          actions={menu.actions}
          intitule="Actions de la conversation"
          onFermer={() => setMenu(null)}
        />
      )}
    </>
  )
}
