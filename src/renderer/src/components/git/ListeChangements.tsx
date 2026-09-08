import { useMemo } from 'react'
import { estNonSuivi, type FichierGit, type Marque } from '@shared/git'
import type { DepotGit } from '@shared/types'
import { useStore } from '@renderer/state/store'
import { vueDiff } from '@renderer/state/vues'
import { IconeFichier } from '../files/IconeFichier'
import { IconeChevron } from '../ui/Icones'

/**
 * Ce que chaque marque dit, et de quelle couleur.
 *
 * La couleur est portée par le nom du fichier, comme dans IntelliJ. Un fichier
 * modifié se lit en bleu, un fichier que git n'a jamais vu en rouge. Cela se
 * voit à la volée, là où une lettre demande de la connaître et une pastille de
 * la chercher.
 */
const MARQUES: Record<Marque, { mot: string; teinte: string }> = {
  inchange: { mot: 'inchangé', teinte: 'text-texte-doux' },
  modifie: { mot: 'modifié', teinte: 'text-info' },
  ajoute: { mot: 'ajouté', teinte: 'text-succes' },
  supprime: { mot: 'supprimé', teinte: 'text-erreur line-through' },
  renomme: { mot: 'renommé', teinte: 'text-cyan' },
  'non-suivi': { mot: 'non suivi', teinte: 'text-erreur' }
}

/** La marque qui compte pour l'affichage : la copie de travail, sinon l'index. */
const marqueDe = (f: FichierGit): Marque => (f.travail === 'inchange' ? f.index : f.travail)

/** L'identité d'un fichier dans la sélection, dépôt compris. */
export const cleDe = (depot: string, fichier: string): string => `${depot} ${fichier}`

/** Les deux sections, séparées parce qu'elles n'engagent pas au même geste. */
type Section = 'changements' | 'neufs'

const TITRES: Record<Section, string> = {
  changements: 'Changements',
  neufs: 'Fichiers non versionnés'
}

/**
 * Les changements d'un projet, dépôt par dépôt.
 *
 * Deux sections, comme dans IntelliJ. Un fichier suivi qu'on a modifié et un
 * fichier que git n'a jamais vu n'engagent pas au même geste : on commite le
 * premier sans y penser, le second demande qu'on ait décidé qu'il entre dans le
 * dépôt. Les mêler expose à emporter le second avec le premier.
 *
 * Un même dépôt paraît donc dans les deux sections quand il porte des deux
 * sortes.
 */
export function ListeChangements({ workspaceId }: { workspaceId: string }): React.JSX.Element {
  const git = useStore((e) => e.git)
  const filtre = useStore((e) => e.filtre)
  const replies = useStore((e) => e.depotsReplies[workspaceId])
  const replier = useStore((e) => e.replierDepot)

  const sections = useMemo(() => {
    const terme = filtre.trim().toLowerCase()
    const retenir = (garder: (f: FichierGit) => boolean): DepotGit[] =>
      (git?.depots ?? [])
        .map((d) => ({
          ...d,
          fichiers: d.fichiers
            .filter(garder)
            .filter((f) => !terme || f.chemin.toLowerCase().includes(terme))
            .sort((a, b) => a.chemin.localeCompare(b.chemin))
        }))
        .filter((d) => d.fichiers.length > 0)

    return {
      changements: retenir((f) => !estNonSuivi(f)),
      neufs: retenir(estNonSuivi)
    }
  }, [git, filtre])

  if (git === undefined) return <p className="px-3 py-2 text-[12.5px] text-texte-faible">Lecture…</p>

  if (git === null) {
    return (
      <div className="px-3 py-2 text-[12.5px] leading-relaxed text-texte-faible">
        Ce projet ne contient aucun dépôt git.
      </div>
    )
  }

  const vide = sections.changements.length === 0 && sections.neufs.length === 0
  if (vide && !(git.reproches && git.reproches.length > 0)) {
    return (
      <p className="px-3 py-2 text-[12.5px] text-texte-faible">
        {filtre.trim()
          ? 'Aucun fichier ne correspond.'
          : `Rien à commiter dans ${git.depots.length > 1 ? `les ${git.depots.length} dépôts` : 'ce dépôt'}.`}
      </p>
    )
  }

  return (
    <>
      {/* Ce que la déclaration a de bancal se dit en tête de liste. Un chemin
          qui ne mène à aucun dépôt disparaîtrait sinon en silence, et la page
          paraîtrait simplement plus courte. */}
      {git.reproches && git.reproches.length > 0 && (
        <ul aria-label="Reproches de la déclaration" className="px-2.5 pt-2">
          {git.reproches.map((r, rang) => (
            <li key={rang} className="flex items-baseline gap-1.5 py-0.5 text-[11.5px]">
              <span className="shrink-0 text-attention">!</span>
              {r.chemin && <span className="shrink-0 font-mono text-texte-doux">{r.chemin}</span>}
              <span className="min-w-0 flex-1 text-texte-tenu">{r.message}</span>
            </li>
          ))}
        </ul>
      )}
      <ul className="pb-2">
      {(['changements', 'neufs'] as const).map(
        (section) =>
          sections[section].length > 0 && (
            <Racine
              key={section}
              section={section}
              depots={sections[section]}
              workspaceId={workspaceId}
              replies={replies ?? []}
              onReplier={replier}
            />
          )
      )}
      </ul>
    </>
  )
}

/** L'identité d'un dépôt dans le repli : le même paraît dans les deux sections. */
const cleRepli = (section: Section, depot: string): string => `${section}:${depot}`

/**
 * Une des deux sections, avec les dépôts qu'elle porte.
 *
 * Le compte annoncé est celui des fichiers, non des dépôts : c'est ce qu'on
 * s'apprête à commiter.
 */
function Racine({
  section,
  depots,
  workspaceId,
  replies,
  onReplier
}: {
  section: Section
  depots: DepotGit[]
  workspaceId: string
  replies: string[]
  onReplier: (workspaceId: string, cle: string) => void
}): React.JSX.Element {
  const coches = useStore((e) => e.coches)
  const cocher = useStore((e) => e.cocher)

  const replie = replies.includes(cleRepli(section, ''))
  const cles = depots.flatMap((d) => d.fichiers.map((f) => cleDe(d.chemin, f.chemin)))
  const tout = cles.every((c) => coches.includes(c))
  const fichiers = cles.length

  return (
    <li>
      <div className="flex h-9 items-stretch gap-1.5 pr-2 pl-1.5 transition-colors hover:bg-fond-survol">
        <Traits profondeur={0} />
        <Case
          cochee={tout}
          partielle={!tout && cles.some((c) => coches.includes(c))}
          libelle={`Tout cocher dans ${TITRES[section]}`}
          onBasculer={() => cocher(cles, !tout)}
        />
        <button
          type="button"
          onClick={() => onReplier(workspaceId, cleRepli(section, ''))}
          aria-expanded={!replie}
          className="flex min-w-0 flex-1 items-center gap-1.5 py-0.5 text-left"
        >
          <Chevron replie={replie} />
          <span className="min-w-0 truncate text-[13px] font-semibold text-texte">
            {TITRES[section]}
          </span>
          <span className="ml-auto shrink-0 font-mono text-[10.5px] text-texte-tenu">
            {fichiers}
          </span>
        </button>
      </div>

      <ul hidden={replie} aria-label={TITRES[section]}>
        {depots.map((depot) => (
          <Depot
            key={depot.chemin}
            section={section}
            depot={depot}
            workspaceId={workspaceId}
            replie={replies.includes(cleRepli(section, depot.chemin))}
            onReplier={onReplier}
          />
        ))}
      </ul>
    </li>
  )
}

/** Un dépôt, dans une section, avec ses fichiers. */
function Depot({
  section,
  depot,
  workspaceId,
  replie,
  onReplier
}: {
  section: Section
  depot: DepotGit
  workspaceId: string
  replie: boolean
  onReplier: (workspaceId: string, cle: string) => void
}): React.JSX.Element {
  const coches = useStore((e) => e.coches)
  const cocher = useStore((e) => e.cocher)
  const ouvrirVue = useStore((e) => e.ouvrirVue)

  const cles = depot.fichiers.map((f) => cleDe(depot.chemin, f.chemin))
  const tout = cles.every((c) => coches.includes(c))

  return (
    <li>
      <div className="flex h-9 items-stretch gap-1.5 pr-2 pl-1.5 transition-colors hover:bg-fond-survol">
        <Traits profondeur={1} />
        <Case
          cochee={tout}
          partielle={!tout && cles.some((c) => coches.includes(c))}
          libelle={`Tout cocher dans ${depot.nom}`}
          onBasculer={() => cocher(cles, !tout)}
        />
        <button
          type="button"
          onClick={() => onReplier(workspaceId, cleRepli(section, depot.chemin))}
          aria-expanded={!replie}
          className="flex min-w-0 flex-1 items-center gap-1.5 py-0.5 text-left"
        >
          <Chevron replie={replie} />
          <span className="min-w-0 truncate text-[13px] font-medium text-texte-doux">
            {depot.nom}
          </span>

          {/* La branche du dépôt, et ce qui attend d'être poussé. Seize dépôts
              peuvent être sur trois branches : la question se pose à chaque
              ligne, pas une fois pour le projet. */}
          <span className="shrink-0 truncate font-mono text-[10.5px] text-texte-tenu">
            {depot.branche || 'tête détachée'}
          </span>
          {depot.avance > 0 && (
            <span
              title={`${depot.avance} commit(s) à pousser`}
              className="shrink-0 font-mono text-[10.5px] text-attention"
            >
              ↑{depot.avance}
            </span>
          )}
          {depot.retard > 0 && (
            <span
              title={`${depot.retard} commit(s) à récupérer`}
              className="shrink-0 font-mono text-[10.5px] text-info"
            >
              ↓{depot.retard}
            </span>
          )}

          <span className="ml-auto shrink-0 font-mono text-[10.5px] text-texte-tenu">
            {depot.fichiers.length}
          </span>
        </button>
      </div>

      <ul hidden={replie} aria-label={`${depot.nom} dans ${TITRES[section]}`}>
        {depot.fichiers.map((fichier) => {
          const cle = cleDe(depot.chemin, fichier.chemin)
          const marque = MARQUES[marqueDe(fichier)]
          const nom = fichier.chemin.split('/').pop() ?? fichier.chemin
          const dossier = fichier.chemin.slice(0, fichier.chemin.length - nom.length)
          return (
            <li
              key={fichier.chemin}
              className="flex items-stretch gap-1.5 pr-2 pl-1.5 transition-colors hover:bg-fond-survol"
            >
              <Traits profondeur={2} />
              <Case
                cochee={coches.includes(cle)}
                libelle={fichier.chemin}
                onBasculer={() => cocher([cle], !coches.includes(cle))}
              />
              <span className="ml-1 flex w-[18px] shrink-0 self-center items-center justify-center">
                <IconeFichier nom={nom} dossier={false} ouvert={false} />
              </span>
              <button
                type="button"
                onClick={() =>
                  ouvrirVue(
                    workspaceId,
                    vueDiff(depot.chemin, depot.nom, fichier.chemin, {
                      // Ce que l'index porte quand la copie de travail est au
                      // net, ce que la copie de travail porte sinon. Les deux
                      // diffs existent ; celui qu'on veut voir est celui du
                      // dernier geste.
                      indexe: fichier.travail === 'inchange',
                      nonSuivi: estNonSuivi(fichier)
                    })
                  )
                }
                title={`${marque.mot} · voir le diff de ${fichier.chemin}`}
                className="flex min-w-0 flex-1 items-baseline gap-1.5 py-2 text-left"
              >
                <span aria-label={marque.mot} className={`shrink-0 truncate text-[13px] ${marque.teinte}`}>
                  {nom}
                </span>
                {/* Le dossier compte autant que le nom : dix `index.ts` dans un
                    même dépôt ne se distinguent que par lui. */}
                {dossier && (
                  <span
                    title={fichier.chemin}
                    dir="rtl"
                    className="min-w-0 flex-1 truncate text-left font-mono text-[10.5px] text-texte-tenu"
                  >
                    {dossier.replace(/\/$/, '')}
                  </span>
                )}
                {fichier.ancien && (
                  <span
                    title={`Renommé depuis ${fichier.ancien}`}
                    className="shrink-0 font-mono text-[10.5px] text-cyan"
                  >
                    ←
                  </span>
                )}
              </button>
            </li>
          )
        })}
      </ul>
    </li>
  )
}

/**
 * Un trait par niveau parcouru, posé dans la ligne elle-même.
 *
 * La même mesure que l'arbre des fichiers, et le même procédé : mis en marge du
 * conteneur, le décalage sortirait la zone d'indentation du survol, et la ligne
 * ne se peindrait plus d'un bord à l'autre.
 */
const Traits = ({ profondeur }: { profondeur: number }): React.JSX.Element => (
  // Les traits vivent dans une boîte à eux, et non côte à côte dans la ligne :
  // l'espacement du conteneur s'y glisserait entre chacun, et un cran vaudrait
  // vingt pixels au premier niveau, vingt-six au suivant. La boîte est là même
  // quand elle est vide, pour que le décalage soit le même partout.
  <span aria-hidden className="flex shrink-0">
    {Array.from({ length: profondeur }, (_, niveau) => (
      <span key={niveau} className="ml-[9px] w-[11px] shrink-0 border-l border-separateur" />
    ))}
  </span>
)

const Chevron = ({ replie }: { replie: boolean }): React.JSX.Element => (
  <span
    aria-hidden
    className={`flex h-5 w-5 shrink-0 items-center justify-center text-texte-tenu transition-transform ${
      replie ? '' : 'rotate-90'
    }`}
  >
    <IconeChevron taille={13} />
  </span>
)

/**
 * Une case à cocher.
 *
 * Écrite plutôt que native : la case du navigateur ne se teinte pas, et l'état
 * partiel d'un ensemble dont une partie seulement est cochée n'a pas
 * d'équivalent qu'on puisse styler sans la refaire.
 */
function Case({
  cochee,
  partielle,
  libelle,
  onBasculer
}: {
  cochee: boolean
  partielle?: boolean
  libelle: string
  onBasculer: () => void
}): React.JSX.Element {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={partielle ? 'mixed' : cochee}
      aria-label={libelle}
      onClick={onBasculer}
      className={`flex h-3.5 w-3.5 shrink-0 self-center items-center justify-center rounded-[3px] border transition-colors ${
        cochee || partielle
          ? 'border-projet bg-projet text-fond'
          : 'border-bordure hover:border-texte-tenu'
      }`}
    >
      {cochee && (
        <svg viewBox="0 0 12 12" className="h-3 w-3" aria-hidden>
          <path
            d="M2.5 6.2 4.8 8.5 9.5 3.8"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      )}
      {partielle && !cochee && <span aria-hidden className="h-[2px] w-2 rounded-full bg-fond" />}
    </button>
  )
}
