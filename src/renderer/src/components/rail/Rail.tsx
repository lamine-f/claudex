import { useMemo, useState } from 'react'
import { useStore } from '@renderer/state/store'
import { IconePlus, IconeRecherche } from '../ui/Icones'

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
  const tabs = useStore((e) => e.tabs)
  const choisir = useStore((e) => e.choisirWorkspace)
  const ajouter = useStore((e) => e.ajouterWorkspace)
  const [filtre, setFiltre] = useState('')

  const retenus = useMemo(() => {
    const terme = filtre.trim().toLowerCase()
    if (!terme) return workspaces
    // Le chemin compte autant que le nom : on cherche parfois un projet dont on
    // ne retient que l'endroit où il vit.
    return workspaces.filter(
      (w) =>
        w.name.toLowerCase().includes(terme) || w.path.toLowerCase().includes(terme)
    )
  }, [workspaces, filtre])

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
          // Le compteur ne vaut que pour le projet courant : les onglets des
          // autres ne sont pas chargés, et afficher zéro serait un mensonge.
          const ouverts = courant ? tabs.length : 0
          return (
            <li key={w.id}>
              <button
                type="button"
                onClick={() => void choisir(w.id)}
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
                {ouverts > 0 && (
                  // Le compteur porte la couleur de son projet, comme le
                  // liseré : deux marques de la même main, pas deux couleurs
                  // sur la même ligne.
                  <span
                    style={{ background: w.color }}
                    className="flex h-[15px] min-w-[15px] shrink-0 items-center justify-center rounded-full px-[3px] font-mono text-[9px] text-fond"
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
    </nav>
  )
}
