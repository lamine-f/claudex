import { useEffect, useMemo } from 'react'
import type { Entree } from '@shared/types'
import { useStore } from '@renderer/state/store'
import { Panneau } from '../ui/Panneau'

interface Ligne {
  entree: Entree
  profondeur: number
  ouvert: boolean
}

/**
 * Aplatit l'arborescence en une liste de lignes visibles.
 * Seuls les dossiers ouverts sont parcourus : un projet volumineux ne coûte donc
 * que ce que l'utilisateur a effectivement déplié.
 */
function aplatir(
  racine: string,
  arbre: Record<string, Entree[]>,
  ouverts: Set<string>,
  profondeur = 0
): Ligne[] {
  const entrees = arbre[racine]
  if (!entrees) return []

  return entrees.flatMap((entree) => {
    const ouvert = entree.dossier && ouverts.has(entree.chemin)
    const ligne: Ligne = { entree, profondeur, ouvert }
    return ouvert
      ? [ligne, ...aplatir(entree.chemin, arbre, ouverts, profondeur + 1)]
      : [ligne]
  })
}

export function FileTree(): React.JSX.Element {
  const workspaces = useStore((e) => e.workspaces)
  const actif = useStore((e) => e.activeWorkspaceId)
  const arbre = useStore((e) => e.arbre)
  const dossiersOuverts = useStore((e) => e.dossiersOuverts)
  const fichierChoisi = useStore((e) => e.fichierChoisi)
  const basculerDossier = useStore((e) => e.basculerDossier)
  const choisirFichier = useStore((e) => e.choisirFichier)
  const rafraichirArbre = useStore((e) => e.rafraichirArbre)

  const courant = workspaces.find((w) => w.id === actif)

  // Le disque bouge sous nos pieds : agents, git, compilations. L'arbre se remet
  // à jour tout seul plutôt que d'attendre un clic.
  useEffect(() => {
    if (!courant) return
    return window.claudex.fs.onChange((racine) => void rafraichirArbre(racine))
  }, [courant, rafraichirArbre])

  const lignes = useMemo(
    () => (courant ? aplatir(courant.path, arbre, new Set(dossiersOuverts)) : []),
    [courant, arbre, dossiersOuverts]
  )

  return (
    <Panneau titre="Fichiers" className="border-l border-bordure">
      {!courant ? (
        <p className="px-3 py-2 text-[12px] text-texte-faible">Aucun projet sélectionné.</p>
      ) : lignes.length === 0 ? (
        <p className="px-3 py-2 text-[12px] text-texte-faible">Dossier vide.</p>
      ) : (
        <ul className="pb-2">
          {lignes.map(({ entree, profondeur, ouvert }) => {
            const choisi = entree.chemin === fichierChoisi
            return (
              <li key={entree.chemin}>
                <button
                  type="button"
                  onClick={() =>
                    entree.dossier
                      ? void basculerDossier(entree.chemin)
                      : void choisirFichier(entree.chemin)
                  }
                  title={entree.chemin}
                  style={{ paddingLeft: 8 + profondeur * 12 }}
                  className={`flex w-full items-center gap-1.5 py-[3px] pr-2 text-left transition-colors ${
                    choisi ? 'bg-fond-eleve' : 'hover:bg-fond-survol'
                  }`}
                >
                  <span className="w-2.5 shrink-0 text-[10px] leading-none text-texte-faible">
                    {entree.dossier ? (ouvert ? '▾' : '▸') : ''}
                  </span>
                  <span
                    className={`truncate font-mono text-[12px] ${
                      entree.dossier
                        ? 'text-texte-doux'
                        : choisi
                          ? 'text-texte'
                          : 'text-texte-faible'
                    } ${entree.discrete ? 'opacity-60' : ''}`}
                  >
                    {entree.nom}
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </Panneau>
  )
}
