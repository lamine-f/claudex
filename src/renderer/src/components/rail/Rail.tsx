import { useMemo, useState } from 'react'
import { reordonner, type Position } from '@shared/ordre'
import type { Workspace } from '@shared/types'
import { useStore } from '@renderer/state/store'
import { MenuSession, type Action } from '../workspaces/MenuSession'
import { IconeAttente, IconePlus, IconeRecherche } from '../ui/Icones'
import { DialogueRetrait } from './DialogueRetrait'

/**
 * Colonne des projets.
 *
 * Les noms sont écrits en toutes lettres : réduits à leurs initiales, ils
 * devenaient indéchiffrables dès que plusieurs partageaient les mêmes
 * premières lettres.
 */
export function Rail(): React.JSX.Element {
  const workspaces = useStore((e) => e.workspaces)
  const actif = useStore((e) => e.activeWorkspaceId)
  const comptes = useStore((e) => e.comptesOnglets)
  const sollicitations = useStore((e) => e.sollicitations)
  const choisir = useStore((e) => e.choisirWorkspace)
  const ajouter = useStore((e) => e.ajouterWorkspace)
  const ranger = useStore((e) => e.rangerWorkspaces)
  const retirer = useStore((e) => e.retirerWorkspace)

  const [filtre, setFiltre] = useState('')
  const [menu, setMenu] = useState<{ x: number; y: number; actions: Action[] } | null>(null)
  const [aRetirer, setARetirer] = useState<Workspace | null>(null)
  const [glisse, setGlisse] = useState<string | null>(null)
  const [survol, setSurvol] = useState<{ id: string; position: Position } | null>(null)

  const retenus = useMemo(() => {
    const terme = filtre.trim().toLowerCase()
    if (!terme) return workspaces
    // Le chemin compte autant que le nom : on cherche parfois un projet dont on
    // ne retient que l'endroit où il vit.
    return workspaces.filter(
      (w) => w.name.toLowerCase().includes(terme) || w.path.toLowerCase().includes(terme)
    )
  }, [workspaces, filtre])

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

  const deposer = (cible: Workspace, position: Position): void => {
    const source = glisse
    setGlisse(null)
    setSurvol(null)
    if (!source) return

    const actuel = workspaces.map((w) => w.id)
    const voulu = reordonner(actuel, source, cible.id, position)
    // Une ligne lâchée là où elle était déjà ne vaut pas un aller-retour vers
    // le disque.
    if (voulu.every((id, rang) => id === actuel[rang])) return
    void ranger(voulu)
  }

  /** Moitié haute ou moitié basse de la ligne : au-dessus, ou en dessous. */
  const positionDe = (evenement: React.DragEvent): Position => {
    const cadre = evenement.currentTarget.getBoundingClientRect()
    return evenement.clientY - cadre.top < cadre.height / 2 ? 'avant' : 'apres'
  }

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
          onClick={() => void ajouter()}
          title="Ajouter un projet"
          aria-label="Ajouter un projet"
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-texte-faible transition-colors hover:bg-fond-survol hover:text-texte"
        >
          <IconePlus taille={16} />
        </button>
      </div>

      <ul className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto px-2">
        {retenus.map((w) => {
          const courant = w.id === actif
          const ouverts = comptes[w.id] ?? 0
          const indicateur = survol?.id === w.id ? survol.position : undefined
          return (
            <li
              key={w.id}
              className={`relative ${glisse === w.id ? 'opacity-40' : ''}`}
              draggable={glissable}
              onDragStart={(e) => {
                e.dataTransfer.effectAllowed = 'move'
                e.dataTransfer.setData('text/plain', w.id)
                setGlisse(w.id)
              }}
              onDragEnd={() => {
                setGlisse(null)
                setSurvol(null)
              }}
              onDragOver={(e) => {
                if (!glissable || !glisse) return
                e.preventDefault()
                e.dataTransfer.dropEffect = 'move'
                setSurvol({ id: w.id, position: positionDe(e) })
              }}
              onDrop={(e) => {
                if (!glissable) return
                e.preventDefault()
                deposer(w, positionDe(e))
              }}
            >
              {indicateur && (
                <span
                  aria-hidden
                  className={`pointer-events-none absolute inset-x-1 z-10 h-[2px] rounded-full bg-projet ${
                    indicateur === 'avant' ? 'top-0' : 'bottom-0'
                  }`}
                />
              )}
              <button
                type="button"
                onClick={() => void choisir(w.id)}
                onContextMenu={(e) => {
                  e.preventDefault()
                  setMenu({
                    x: e.clientX,
                    y: e.clientY,
                    actions: [
                      {
                        libelle: 'Retirer le projet…',
                        ecarte: true,
                        onChoisir: () => setARetirer(w)
                      }
                    ]
                  })
                }}
                title={w.path}
                className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2.5 text-left transition-colors ${
                  courant ? 'bg-fond-eleve' : 'hover:bg-fond-survol'
                }`}
              >
                <span
                  aria-hidden
                  className="h-4 w-[2px] shrink-0 rounded-full"
                  style={{ background: courant ? w.color : 'transparent' }}
                />
                <span
                  className={`min-w-0 flex-1 truncate text-[14.5px] ${
                    courant ? 'text-texte' : 'text-texte-faible'
                  }`}
                >
                  {w.name}
                </span>
                {enAttente.has(w.id) && (
                  <span
                    aria-label="Un agent vous attend"
                    title="Un agent de ce projet attend une réponse"
                    className="shrink-0 text-attention"
                  >
                    <IconeAttente taille={13} />
                  </span>
                )}
                {ouverts > 0 && (
                  // Le compteur porte la couleur de son projet, comme le liseré,
                  // et la perd avec lui dès qu'on regarde ailleurs. Il vaut pour
                  // tous les projets, or dix pastilles pleines réclameraient
                  // toutes l'œil en même temps et aucune ne dirait plus rien.
                  <span
                    style={courant ? { background: w.color } : undefined}
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
        })}

        {retenus.length === 0 && (
          <li className="px-2.5 py-2 text-[13px] text-texte-tenu">
            {workspaces.length === 0 ? 'Aucun projet.' : 'Aucun projet ne correspond.'}
          </li>
        )}
      </ul>

      {menu && (
        <MenuSession
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
}
