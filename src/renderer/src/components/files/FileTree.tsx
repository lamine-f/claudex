import { useEffect, useMemo } from 'react'
import type { Entree } from '@shared/types'
import { ChevronRight } from 'lucide-react'
import { useStore } from '@renderer/state/store'
import { IconeFichier } from './IconeFichier'

/**
 * Tableau vide partagé.
 *
 * Un sélecteur qui construit `[]` à chaque appel rend une référence neuve à
 * chaque rendu : le store la croit changée, redéclenche un rendu, et la boucle
 * ne s'arrête plus.
 */
const AUCUN: string[] = []

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
  const dossiersOuverts = useStore((e) => (actif ? (e.dossiersOuverts[actif] ?? AUCUN) : AUCUN))
  const lectureEnCours = useStore((e) => e.lectureEnCours)
  const fichierChoisi = useStore((e) => e.fichierChoisi)
  const basculerDossier = useStore((e) => e.basculerDossier)
  const choisirFichier = useStore((e) => e.choisirFichier)
  const rafraichirArbre = useStore((e) => e.rafraichirArbre)

  const courant = workspaces.find((w) => w.id === actif)
  const litLaRacine = Boolean(courant && lectureEnCours.includes(courant.path))

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

  // L'en-tête est porté par l'onglet de la colonne : le répéter ici ferait doublon.
  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
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
                  className={`flex w-full items-stretch py-[3px] pr-2 text-left transition-colors ${
                    choisi ? 'bg-fond-eleve' : 'hover:bg-fond-survol'
                  }`}
                >
                  {/* Un trait par niveau parcouru : sans eux, un arbre déplié en
                      profondeur se lit comme une liste plate et l'on perd de vue
                      à quel dossier appartient un fichier. */}
                  {Array.from({ length: profondeur }, (_, niveau) => (
                    <span
                      key={niveau}
                      aria-hidden
                      className="ml-[9px] w-[11px] shrink-0 border-l border-separateur"
                    />
                  ))}
                  <span className="ml-2 flex w-3.5 shrink-0 items-center justify-center">
                    {entree.dossier && (
                      <ChevronRight
                        size={11}
                        strokeWidth={1.5}
                        absoluteStrokeWidth
                        className={`text-texte-faible transition-transform ${ouvert ? 'rotate-90' : ''}`}
                      />
                    )}
                  </span>
                  <span className="mr-1.5 flex w-[22px] shrink-0 items-center justify-center">
                    <IconeFichier nom={entree.nom} dossier={entree.dossier} ouvert={ouvert} />
                  </span>
                  <span
                    // Ce que git ignore existe sur le disque sans faire partie du
                    // projet : l'italique le dit sans le cacher.
                    className={`truncate font-mono text-[12px] leading-5 ${
                      entree.dossier
                        ? 'text-texte-doux'
                        : choisi
                          ? 'text-texte'
                          : 'text-texte-faible'
                    } ${entree.discrete ? 'opacity-60' : ''} ${
                      entree.ignoree ? 'text-texte-tenu italic' : ''
                    }`}
                  >
                    {entree.nom}
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
