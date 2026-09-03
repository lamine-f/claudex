import { useMemo, useState } from 'react'
import type { StatutSession } from '@shared/types'
import { useStore } from '@renderer/state/store'
import { FileTree } from '../files/FileTree'
import { MenuSession, type Action } from '../workspaces/MenuSession'
import { SessionRow } from '../workspaces/SessionRow'

/** Nombre de conversations montrées avant d'avoir à dérouler le reste. */
const APERCU = 10

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
  const filtrer = useStore((e) => e.filtre !== undefined ? e.filtrer : e.filtrer)
  const sessions = useStore((e) => (actif ? e.sessions[actif] : undefined))
  const chargement = useStore((e) => (actif ? e.sessionsEnCours[actif] : false))
  const chargerSessions = useStore((e) => e.chargerSessions)
  const tout = useStore((e) => (actif ? e.toutAfficher[actif] : false))
  const tabs = useStore((e) => e.tabs)
  const activeTabId = useStore((e) => e.activeTabId)
  const ouvrirSession = useStore((e) => e.ouvrirSession)
  const demanderBifurcation = useStore((e) => e.demanderBifurcation)
  const etiqueter = useStore((e) => e.etiqueter)
  const renommer = useStore((e) => e.renommer)
  const basculerFavori = useStore((e) => e.basculerFavori)
  const ecarterSession = useStore((e) => e.ecarterSession)
  const [menu, setMenu] = useState<{ x: number; y: number; actions: Action[] } | null>(null)
  const derouler = useStore((e) => e.deroulerTout)

  const courant = workspaces.find((w) => w.id === actif)
  const ouvertes = useMemo(
    () => new Set(tabs.map((t) => t.claudeSessionId).filter(Boolean)),
    [tabs]
  )
  const aLEcran = tabs.find((t) => t.id === activeTabId)?.claudeSessionId

  const retenues = useMemo(() => {
    const terme = filtre.trim().toLowerCase()
    if (!sessions) return undefined
    return terme ? sessions.filter((s) => s.titre.toLowerCase().includes(terme)) : sessions
  }, [sessions, filtre])

  const visibles = tout || filtre ? retenues : retenues?.slice(0, APERCU)
  const reste = (retenues?.length ?? 0) - (visibles?.length ?? 0)

  const onglet = (cle: 'sessions' | 'fichiers', libelle: string, compte?: number): React.JSX.Element => (
    <button
      type="button"
      onClick={() => choisirPanneau(cle)}
      className={`flex items-center gap-1.5 rounded-md border px-2.5 py-1 font-mono text-[11px] tracking-[0.1em] transition-colors ${
        panneau === cle
          ? 'border-bordure bg-fond-eleve text-texte'
          : 'border-transparent text-texte-faible hover:text-texte-doux'
      }`}
    >
      {libelle}
      {compte !== undefined && <span className="text-texte-tenu">{compte}</span>}
    </button>
  )

  return (
    <section
      aria-label="Sessions et fichiers"
      className="flex h-full min-w-0 flex-col border-r border-separateur bg-fond-panneau"
    >
      <div className="flex h-11 shrink-0 items-center gap-1 px-2.5">
        {onglet('sessions', 'SESSIONS', retenues?.length)}
        {onglet('fichiers', 'FICHIERS')}
        <div className="flex-1" />

        {panneau === 'sessions' && courant && (
          <button
            type="button"
            onClick={() => void chargerSessions(courant.id)}
            title="Relire les conversations du projet"
            aria-label="Relire les conversations"
            className={`flex h-6 w-6 items-center justify-center rounded text-texte-faible transition-colors hover:bg-fond-survol hover:text-texte ${
              chargement ? 'animate-spin' : ''
            }`}
          >
            {/* Une branche n'apparaît qu'une fois son transcrit écrit, quelques
                secondes après son lancement : ce bouton évite d'attendre sans
                savoir si l'on attend pour rien. */}
            <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden>
              <path
                d="M13.5 8a5.5 5.5 0 1 1-1.6-3.9M13.5 2v3h-3"
                stroke="currentColor"
                strokeWidth="1.4"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
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
            {chargement && !sessions ? (
              <p className="px-3 py-2 text-[12px] text-texte-faible">Lecture des conversations…</p>
            ) : visibles?.length ? (
              <ul>
                {visibles.map((session) => {
                  // Ce qui est déductible aujourd'hui : la conversation qu'on a
                  // sous les yeux, et celles qui patientent dans un autre onglet.
                  // « en attente » et « interrompue » demandent de savoir ce que
                  // fait l'agent, ce que les hooks de Claude Code apporteront.
                  const statut: StatutSession =
                    session.id === aLEcran
                      ? 'active'
                      : ouvertes.has(session.id)
                        ? 'ouverte'
                        : 'terminee'
                  return (
                    <SessionRow
                      key={session.id}
                      session={session}
                      statut={statut}
                      onOuvrir={() =>
                        void ouvrirSession(courant.id, 'reprise', session.id, session.titre)
                      }
                      onBifurquer={() =>
                        demanderBifurcation(courant.id, session.id, session.titre)
                      }
                      onEtiqueter={(texte) => void etiqueter(courant.id, session.id, texte)}
                      onRenommer={(titre) => void renommer(courant.id, session.id, titre)}
                      onMenu={(x, y, editer) =>
                        setMenu({
                          x,
                          y,
                          actions: [
                            {
                              libelle: session.epinglee
                                ? 'Retirer des favoris'
                                : 'Mettre en favori',
                              onChoisir: () =>
                                void basculerFavori(courant.id, session.id, !session.epinglee)
                            },
                            { libelle: 'Renommer', onChoisir: () => editer('titre') },
                            {
                              libelle: session.etiquette ? "Changer l'étiquette" : 'Étiqueter',
                              onChoisir: () => editer('etiquette')
                            },
                            {
                              libelle: 'Écarter la conversation…',
                              ecarte: true,
                              onChoisir: () => void ecarterSession(courant.id, session)
                            }
                          ]
                        })
                      }
                    />
                  )
                })}
                {reste > 0 && (
                  <li>
                    <button
                      type="button"
                      onClick={() => derouler(courant.id)}
                      className="w-full px-3 py-2 text-left text-[12px] text-texte-faible transition-colors hover:text-texte-doux"
                    >
                      ⋯ {reste} autre{reste > 1 ? 's' : ''}
                    </button>
                  </li>
                )}
              </ul>
            ) : (
              <p className="px-3 py-2 text-[12px] text-texte-faible">
                {filtre ? 'Aucune conversation ne correspond.' : 'aucune session ici'}
              </p>
            )}
          </div>

          <div className="shrink-0 p-2.5">
            <button
              type="button"
              onClick={() => void ouvrirSession(courant.id, 'nouvelle')}
              className="w-full rounded-lg border border-dashed border-bordure py-2.5 text-[13px] text-texte-doux transition-colors hover:border-accent-tenu hover:text-accent"
            >
              + Nouvelle session
            </button>
          </div>
        </div>
      )}
      {menu && (
        <MenuSession x={menu.x} y={menu.y} actions={menu.actions} onFermer={() => setMenu(null)} />
      )}
    </section>
  )
}
