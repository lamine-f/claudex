import { useEffect, useMemo, useRef, useState } from 'react'
import {
  assembler,
  RANGEMENT_VIDE,
  type Cible,
  type Element,
  type Ligne
} from '@shared/rangement'
import type { Workspace } from '@shared/types'
import { useStore } from '@renderer/state/store'
import { MenuContextuel, type Action } from '../ui/MenuContextuel'
import { IconeAttente, IconeChevron, IconeNouveauGroupe, IconePlus, IconeRecherche } from '../ui/Icones'
import { DialogueRetrait } from './DialogueRetrait'

/**
 * Colonne des projets.
 *
 * Les noms sont écrits en toutes lettres : réduits à leurs initiales, ils
 * devenaient indéchiffrables dès que plusieurs partageaient les mêmes premières
 * lettres.
 *
 * Les projets se rangent en groupes, par le même modèle que les conversations.
 * Il ne connaît de ce qu'il range que son identifiant, et sert donc aux deux
 * sans qu'on écrive deux fois la mécanique du glisser-déposer.
 */
export function Rail(): React.JSX.Element {
  const workspaces = useStore((e) => e.workspaces)
  const actif = useStore((e) => e.activeWorkspaceId)
  const comptes = useStore((e) => e.comptesOnglets)
  const sollicitations = useStore((e) => e.sollicitations)
  const rangement = useStore((e) => e.rangementProjets)
  const choisir = useStore((e) => e.choisirWorkspace)
  const ajouter = useStore((e) => e.ajouterWorkspace)
  const retirer = useStore((e) => e.retirerWorkspace)
  const ouvrirGroupe = useStore((e) => e.ouvrirGroupeProjets)
  const nommerGroupe = useStore((e) => e.nommerGroupeProjets)
  const replierGroupe = useStore((e) => e.replierGroupeProjets)
  const defaireGroupe = useStore((e) => e.defaireGroupeProjets)
  const deplacer = useStore((e) => e.deplacerProjet)
  const aNommer = useStore((e) => e.groupeProjetANommer)
  const finirNommage = useStore((e) => e.finirNommageProjet)

  const [filtre, setFiltre] = useState('')
  const [menu, setMenu] = useState<{ x: number; y: number; actions: Action[] } | null>(null)
  const [aRetirer, setARetirer] = useState<Workspace | null>(null)
  const [glisse, setGlisse] = useState<Element | null>(null)
  const [survol, setSurvol] = useState<{ cle: string; ou: 'avant' | 'apres' | 'dans' } | null>(null)

  const lignes = useMemo(() => {
    const terme = filtre.trim().toLowerCase()
    // Le chemin compte autant que le nom : on cherche parfois un projet dont on
    // ne retient que l'endroit où il vit.
    const garde = (w: Workspace): boolean =>
      w.name.toLowerCase().includes(terme) || w.path.toLowerCase().includes(terme)
    const toutes = assembler(workspaces, rangement ?? RANGEMENT_VIDE)
    if (!terme) return toutes
    return toutes.flatMap((ligne): Ligne<Workspace>[] => {
      if (ligne.type === 'element') return garde(ligne.element) ? [ligne] : []
      const trouves = ligne.membres.filter(garde)
      // Un groupe replié ne doit pas cacher ce que l'on cherche.
      return trouves.length > 0 ? [{ ...ligne, membres: trouves, replie: false }] : []
    })
  }, [workspaces, rangement, filtre])

  // Les onglets des autres projets ne sont pas chargés : sans cette marque, un
  // agent qui appelle depuis un projet qu'on ne regarde pas resterait invisible
  // tant qu'on n'y serait pas retourné.
  const enAttente = useMemo(
    () => new Set(Object.values(sollicitations).map((s) => s.workspaceId)),
    [sollicitations]
  )

  // Réarranger sous un filtre n'aurait pas de sens : l'ordre affiché n'est plus
  // celui de la liste, et « déposer ici » ne désignerait rien de sûr.
  const glissable = !filtre

  /** Moitié haute ou moitié basse de la ligne : au-dessus, ou en dessous. */
  const positionDe = (evenement: React.DragEvent): 'avant' | 'apres' => {
    const cadre = evenement.currentTarget.getBoundingClientRect()
    return evenement.clientY - cadre.top < cadre.height / 2 ? 'avant' : 'apres'
  }

  /** Rang d'une ligne du premier niveau, tel que le rangement le compte. */
  const rangDe = (index: number, ou: 'avant' | 'apres'): number =>
    ou === 'avant' ? index : index + 1

  const deposer = async (cible: Cible): Promise<void> => {
    const quoi = glisse
    setGlisse(null)
    setSurvol(null)
    if (quoi) await deplacer(quoi, cible)
  }

  const proprietesDeGlisse = (quoi: Element): Record<string, unknown> =>
    glissable
      ? {
          draggable: true,
          onDragStart: (e: React.DragEvent) => {
            e.dataTransfer.effectAllowed = 'move'
            e.dataTransfer.setData('text/plain', quoi.id)
            setGlisse(quoi)
          },
          onDragEnd: () => {
            setGlisse(null)
            setSurvol(null)
          }
        }
      : {}

  const trait = (ou: 'avant' | 'apres'): React.JSX.Element => (
    <span
      aria-hidden
      className={`pointer-events-none absolute inset-x-1 z-10 h-[2px] rounded-full bg-projet ${
        ou === 'avant' ? 'top-0' : 'bottom-0'
      }`}
    />
  )

  return (
    <nav
      aria-label="Projets"
      className="flex h-full w-[212px] shrink-0 flex-col border-r border-separateur bg-fond-rail py-3"
    >
      <div className="flex shrink-0 items-center gap-1.5 px-2 pb-2">
        <div className="flex min-w-0 flex-1 items-center gap-2 rounded-lg border border-separateur bg-fond-creux px-2.5 focus-within:border-bordure">
          <span className="shrink-0 text-texte-tenu">
            <IconeRecherche taille={13} />
          </span>
          <input
            type="search"
            value={filtre}
            onChange={(e) => setFiltre(e.target.value)}
            placeholder="Rechercher"
            aria-label="Rechercher un projet"
            className="min-w-0 flex-1 bg-transparent py-2 text-[13px] text-texte-doux placeholder:text-texte-tenu focus:outline-none"
          />
        </div>

        <button
          type="button"
          onClick={() => void ouvrirGroupe(0)}
          title="Nouveau groupe"
          aria-label="Nouveau groupe"
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-texte-faible transition-colors hover:bg-fond-survol hover:text-texte"
        >
          <IconeNouveauGroupe taille={15} />
        </button>

        <button
          type="button"
          onClick={() => void ajouter()}
          title="Ajouter un projet"
          aria-label="Ajouter un projet"
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-texte-faible transition-colors hover:bg-fond-survol hover:text-texte"
        >
          <IconePlus taille={16} />
        </button>
      </div>

      <ul className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto px-2">
        {lignes.map((ligne, index) => {
          if (ligne.type === 'groupe') {
            const cle = `g:${ligne.id}`
            return (
              <li
                key={cle}
                className={`relative ${glisse?.id === ligne.id ? 'opacity-40' : ''}`}
                {...proprietesDeGlisse({ type: 'groupe', id: ligne.id })}
                onDragOver={(e) => {
                  if (!glissable || !glisse) return
                  e.preventDefault()
                  // Un groupe ne rentre pas dans un groupe : imbriquer donnerait
                  // une arborescence là où l'on veut un classeur.
                  const dedans = glisse.type === 'session'
                  setSurvol({ cle, ou: dedans ? 'dans' : positionDe(e) })
                }}
                onDrop={(e) => {
                  if (!glissable) return
                  e.preventDefault()
                  const ou = survol?.cle === cle ? survol.ou : 'apres'
                  void deposer(
                    ou === 'dans'
                      ? { groupe: ligne.id, index: ligne.membres.length }
                      : { groupe: null, index: rangDe(index, ou) }
                  )
                }}
              >
                {survol?.cle === cle && survol.ou !== 'dans' && trait(survol.ou)}

                <EnteteGroupeProjets
                  nom={ligne.nom}
                  compte={ligne.membres.length}
                  replie={ligne.replie}
                  vise={survol?.cle === cle && survol.ou === 'dans'}
                  enNommage={aNommer === ligne.id}
                  onReplier={() => void replierGroupe(ligne.id, !ligne.replie)}
                  onNommer={(nom) => void nommerGroupe(ligne.id, nom)}
                  onAbandonner={finirNommage}
                  onMenu={(x, y) =>
                    setMenu({
                      x,
                      y,
                      actions: [
                        { libelle: 'Renommer le groupe', onChoisir: () => void nommerGroupe(ligne.id, ligne.nom) },
                        {
                          libelle: 'Défaire le groupe',
                          ecarte: true,
                          onChoisir: () => void defaireGroupe(ligne.id)
                        }
                      ]
                    })
                  }
                />

                {!ligne.replie && (
                  <ul className="flex flex-col gap-0.5 pl-3">
                    {ligne.membres.map((w, rang) => (
                      <LigneProjet
                        key={w.id}
                        workspace={w}
                        courant={w.id === actif}
                        ouverts={comptes[w.id] ?? 0}
                        attend={enAttente.has(w.id)}
                        glisseEnCours={glisse?.id === w.id}
                        indicateur={survol?.cle === `p:${w.id}` ? survol.ou : undefined}
                        proprietes={proprietesDeGlisse({ type: 'session', id: w.id })}
                        onSurvol={(ou) => setSurvol({ cle: `p:${w.id}`, ou })}
                        onDeposer={(ou) =>
                          void deposer({ groupe: ligne.id, index: rangDe(rang, ou) })
                        }
                        onChoisir={() => void choisir(w.id)}
                        onMenu={(x, y) =>
                          setMenu({ x, y, actions: actionsProjet(w, ligne.id) })
                        }
                      />
                    ))}
                  </ul>
                )}
              </li>
            )
          }

          const w = ligne.element
          return (
            <LigneProjet
              key={w.id}
              workspace={w}
              courant={w.id === actif}
              ouverts={comptes[w.id] ?? 0}
              attend={enAttente.has(w.id)}
              glisseEnCours={glisse?.id === w.id}
              indicateur={survol?.cle === `p:${w.id}` ? survol.ou : undefined}
              proprietes={proprietesDeGlisse({ type: 'session', id: w.id })}
              onSurvol={(ou) => setSurvol({ cle: `p:${w.id}`, ou })}
              onDeposer={(ou) => void deposer({ groupe: null, index: rangDe(index, ou) })}
              onChoisir={() => void choisir(w.id)}
              onMenu={(x, y) => setMenu({ x, y, actions: actionsProjet(w, null) })}
            />
          )
        })}

        {lignes.length === 0 && (
          <li className="px-2.5 py-2 text-[13px] text-texte-tenu">
            {workspaces.length === 0 ? 'Aucun projet.' : 'Aucun projet ne correspond.'}
          </li>
        )}
      </ul>

      {menu && (
        <MenuContextuel
          x={menu.x}
          y={menu.y}
          actions={menu.actions}
          intitule="Actions du projet"
          onFermer={() => setMenu(null)}
        />
      )}
      {aRetirer && (
        <DialogueRetrait
          workspace={aRetirer}
          onglets={comptes[aRetirer.id] ?? 0}
          onConfirmer={() => {
            const cible = aRetirer
            setARetirer(null)
            void retirer(cible.id)
          }}
          onAnnuler={() => setARetirer(null)}
        />
      )}
    </nav>
  )

  function actionsProjet(w: Workspace, groupe: string | null): Action[] {
    return [
      {
        libelle: 'Nouveau groupe avec ce projet',
        onChoisir: () => void ouvrirGroupe(0, [w.id])
      },
      ...(groupe
        ? [
            {
              libelle: 'Sortir du groupe',
              onChoisir: () => void deplacer({ type: 'session', id: w.id }, { groupe: null, index: 0 })
            }
          ]
        : []),
      { libelle: 'Retirer le projet…', ecarte: true, onChoisir: () => setARetirer(w) }
    ]
  }
}

/** L'en-tête d'un groupe du rail, qui se replie et se renomme. */
function EnteteGroupeProjets({
  nom,
  compte,
  replie,
  vise,
  enNommage,
  onReplier,
  onNommer,
  onAbandonner,
  onMenu
}: {
  nom: string
  compte: number
  replie: boolean
  vise: boolean
  enNommage: boolean
  onReplier: () => void
  onNommer: (nom: string) => void
  onAbandonner: () => void
  onMenu: (x: number, y: number) => void
}): React.JSX.Element {
  const champ = useRef<HTMLInputElement | null>(null)
  const [texte, setTexte] = useState(nom)

  useEffect(() => {
    if (enNommage) {
      setTexte(nom)
      champ.current?.focus()
      champ.current?.select()
    }
  }, [enNommage, nom])

  return (
    <div
      onContextMenu={(e) => {
        e.preventDefault()
        onMenu(e.clientX, e.clientY)
      }}
      // La même facture que l'en-tête d'un groupe de conversations : même
      // hauteur, même chevron, même taille de texte. Trois listes qui se
      // ressemblent doivent se ressembler jusque dans leurs mesures.
      // Les marges négatives annulent le retrait de la liste : un en-tête de
      // groupe se peint d'un bord à l'autre du rail, comme celui d'un groupe de
      // conversations, tandis que les projets restent des pastilles en retrait.
      className={`-mx-2 flex items-center gap-1.5 py-2 pr-4 pl-3.5 transition-colors ${
        vise ? 'bg-fond-eleve ring-1 ring-projet' : 'hover:bg-fond-survol'
      }`}
    >
      <button
        type="button"
        onClick={onReplier}
        title={replie ? 'Déployer le groupe' : 'Replier le groupe'}
        aria-label={replie ? 'Déployer le groupe' : 'Replier le groupe'}
        aria-expanded={!replie}
        className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-texte-tenu transition-colors hover:text-texte-doux"
      >
        <span className={`transition-transform ${replie ? '' : 'rotate-90'}`}>
          <IconeChevron taille={13} />
        </span>
      </button>

      {enNommage ? (
        <input
          ref={champ}
          value={texte}
          onChange={(e) => setTexte(e.target.value)}
          onBlur={() => onNommer(texte)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') onNommer(texte)
            if (e.key === 'Escape') onAbandonner()
          }}
          aria-label="Nom du groupe"
          placeholder="Nom du groupe"
          className="min-w-0 flex-1 rounded border border-projet-tenu bg-fond-eleve px-1.5 py-px text-[13px] text-texte placeholder:text-texte-tenu focus:outline-none"
        />
      ) : (
        <span className="min-w-0 flex-1 truncate text-left text-[13px] font-medium text-texte-doux">
          {nom || 'Sans nom'}
        </span>
      )}

      <span className="shrink-0 font-mono text-[10.5px] text-texte-tenu">{compte}</span>
    </div>
  )
}

/** Une ligne de projet, dans un groupe ou au premier niveau. */
function LigneProjet({
  workspace,
  courant,
  ouverts,
  attend,
  glisseEnCours,
  indicateur,
  proprietes,
  onSurvol,
  onDeposer,
  onChoisir,
  onMenu
}: {
  workspace: Workspace
  courant: boolean
  ouverts: number
  attend: boolean
  glisseEnCours: boolean
  indicateur?: 'avant' | 'apres' | 'dans'
  proprietes: Record<string, unknown>
  onSurvol: (ou: 'avant' | 'apres') => void
  onDeposer: (ou: 'avant' | 'apres') => void
  onChoisir: () => void
  onMenu: (x: number, y: number) => void
}): React.JSX.Element {
  const position = (e: React.DragEvent): 'avant' | 'apres' => {
    const cadre = e.currentTarget.getBoundingClientRect()
    return e.clientY - cadre.top < cadre.height / 2 ? 'avant' : 'apres'
  }

  return (
    <li
      className={`relative ${glisseEnCours ? 'opacity-40' : ''}`}
      {...proprietes}
      onDragOver={(e) => {
        e.preventDefault()
        e.dataTransfer.dropEffect = 'move'
        onSurvol(position(e))
      }}
      onDrop={(e) => {
        e.preventDefault()
        onDeposer(position(e))
      }}
    >
      {indicateur && indicateur !== 'dans' && (
        <span
          aria-hidden
          className={`pointer-events-none absolute inset-x-1 z-10 h-[2px] rounded-full bg-projet ${
            indicateur === 'avant' ? 'top-0' : 'bottom-0'
          }`}
        />
      )}

      <button
        type="button"
        onClick={onChoisir}
        onContextMenu={(e) => {
          e.preventDefault()
          onMenu(e.clientX, e.clientY)
        }}
        title={workspace.path}
        className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2.5 text-left transition-colors ${
          courant ? 'bg-fond-eleve' : 'hover:bg-fond-survol'
        }`}
      >
        <span
          aria-hidden
          className="h-4 w-[2px] shrink-0 rounded-full"
          style={{ background: courant ? workspace.color : 'transparent' }}
        />
        <span
          className={`min-w-0 flex-1 truncate text-[14.5px] ${
            courant ? 'text-texte' : 'text-texte-faible'
          }`}
        >
          {workspace.name}
        </span>
        {attend && (
          <span
            aria-label="Un agent vous attend"
            title="Un agent de ce projet attend une réponse"
            className="shrink-0 text-attention"
          >
            <IconeAttente taille={13} />
          </span>
        )}
        {ouverts > 0 && (
          // Le compteur porte la couleur de son projet, comme le liseré, et la
          // perd avec lui dès qu'on regarde ailleurs.
          <span
            style={courant ? { background: workspace.color } : undefined}
            title={ouverts > 1 ? `${ouverts} terminaux ouverts` : '1 terminal ouvert'}
            className={`flex h-[15px] min-w-[15px] shrink-0 items-center justify-center rounded-full px-[3px] font-mono text-[9px] ${
              courant ? 'text-fond' : 'bg-fond-eleve text-texte-tenu'
            }`}
          >
            {ouverts}
          </span>
        )}
      </button>
    </li>
  )
}
