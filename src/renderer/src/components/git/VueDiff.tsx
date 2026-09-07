import { useEffect, useRef, useState } from 'react'
import { apparier, compter, lireDiff, type LigneDiff, type Section } from '@shared/diff'
import { useStore } from '@renderer/state/store'
import { IconeChevron } from '../ui/Icones'

/** Ce qui a été lu, ou la raison pour laquelle rien ne s'affiche. */
type Etat =
  | { phase: 'lecture' }
  | { phase: 'lu'; diff: ReturnType<typeof lireDiff> }
  | { phase: 'binaire' }
  | { phase: 'trop'; octets: number }
  | { phase: 'vide' }

/**
 * Assez de lignes pour couvrir un fichier entier.
 *
 * `git diff` borne le contexte à la taille du fichier : en demander cent mille
 * revient à tout demander, sans avoir à compter d'abord.
 */
const TOUT = 100_000

/**
 * Le diff d'un fichier, côte à côte ou d'un seul tenant.
 *
 * Le format unifié porte déjà les numéros de ligne des deux côtés : la vue à
 * deux colonnes se construit à partir de lui, sans comparer quoi que ce soit
 * une seconde fois.
 *
 * IntelliJ montre le fichier entier et propose de replier ce qui n'a pas
 * changé. Claudex fait l'inverse par défaut, parce qu'afficher quatre mille
 * lignes pour en montrer deux coûte cher, mais la bascule mène au même
 * endroit. C'est ce qui manquait au défilement : d'un îlot de trois lignes à
 * l'autre, on saute au lieu de parcourir.
 */
export function VueDiff({
  workspaceId,
  depot,
  nomDepot,
  fichier,
  indexe,
  nonSuivi,
  onFermer
}: {
  workspaceId: string
  depot: string
  nomDepot: string
  fichier: string
  indexe: boolean
  nonSuivi: boolean
  /** Ferme la vue. Le fichier, lui, reste sur le disque. */
  onFermer: () => void
}): React.JSX.Element {
  const cote = useStore((e) => e.diffCoteACote)
  const basculerCote = useStore((e) => e.basculerDiffCoteACote)
  const entier = useStore((e) => e.diffEntier)
  const basculerEntier = useStore((e) => e.basculerDiffEntier)

  const [etat, setEtat] = useState<Etat>({ phase: 'lecture' })
  const zone = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    let vivant = true
    setEtat({ phase: 'lecture' })
    void window.claudex.git
      .diff(workspaceId, depot, fichier, { indexe, nonSuivi, contexte: entier ? TOUT : 3 })
      .then((lu) => {
        if (!vivant) return
        if (lu.trop) return setEtat({ phase: 'trop', octets: lu.trop })
        const diff = lireDiff(lu.sortie)
        if (diff.binaire) return setEtat({ phase: 'binaire' })
        if (diff.sections.length === 0) return setEtat({ phase: 'vide' })
        setEtat({ phase: 'lu', diff })
      })
    return () => {
      vivant = false
    }
  }, [workspaceId, depot, fichier, indexe, nonSuivi, entier])

  const mesure =
    etat.phase === 'lu'
      ? (({ ajoutees, retirees }) => `+${ajoutees} −${retirees}`)(compter(etat.diff))
      : undefined

  /**
   * Amène au changement suivant, ou au précédent.
   *
   * Le geste d'IntelliJ, qui le met sur F7. Il prend tout son sens le fichier
   * entier affiché, où deux lignes changées se perdent dans quatre mille.
   */
  const allerAuChangement = (sens: 1 | -1): void => {
    const conteneur = zone.current
    if (!conteneur) return
    const marques = [...conteneur.querySelectorAll<HTMLElement>('[data-change]')]
    if (marques.length === 0) return

    const haut = conteneur.scrollTop
    const candidates = marques.filter((m) =>
      sens === 1 ? m.offsetTop - 24 > haut + 4 : m.offsetTop - 24 < haut - 4
    )
    // Au bout, on ne bouge pas. Repartir de l'autre extrémité ferait sauter
    // l'écran d'un bout à l'autre du fichier sans qu'on l'ait demandé.
    const cible = sens === 1 ? candidates[0] : candidates[candidates.length - 1]
    if (cible) conteneur.scrollTo({ top: Math.max(0, cible.offsetTop - 24) })
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-fond">
      <div className="flex shrink-0 items-center gap-3 border-b border-separateur px-3 py-2">
        <span className="truncate text-[13px] text-texte">{fichier.split('/').pop()}</span>
        <span className="truncate font-mono text-[11px] text-texte-tenu">
          {nomDepot} · {fichier}
        </span>
        <div className="flex-1" />

        {mesure && (
          <span className="shrink-0 font-mono text-[11px] text-texte-faible">{mesure}</span>
        )}

        {/* Ce que la vue compare, dit en clair. Un même fichier a deux diffs
            selon le côté regardé, et rien d'autre ne les distingue à l'écran. */}
        <span className="shrink-0 font-mono text-[11px] text-texte-tenu">
          {nonSuivi ? 'fichier neuf' : indexe ? 'index → HEAD' : 'travail → index'}
        </span>

        {etat.phase === 'lu' && (
          <span className="flex shrink-0 items-center">
            <Geste titre="Changement précédent" onClic={() => allerAuChangement(-1)} sens="haut" />
            <Geste titre="Changement suivant" onClic={() => allerAuChangement(1)} sens="bas" />
          </span>
        )}

        <Bascule
          actif={entier}
          titre={entier ? 'Ne montrer que les changements' : 'Montrer le fichier entier'}
          onBasculer={basculerEntier}
        >
          {entier ? 'fichier entier' : 'changements'}
        </Bascule>

        <Bascule
          actif={cote}
          titre={cote ? 'Passer au diff d’un seul tenant' : 'Passer au diff côte à côte'}
          onBasculer={basculerCote}
        >
          {cote ? 'côte à côte' : 'unifié'}
        </Bascule>

        <button
          type="button"
          onClick={onFermer}
          title="Fermer la vue. Le fichier reste sur le disque."
          className="shrink-0 rounded px-1.5 text-texte-tenu transition-colors hover:text-texte"
        >
          ✕
        </button>
      </div>

      <div ref={zone} aria-label="Contenu du diff" className="min-h-0 flex-1 overflow-auto">
        {etat.phase === 'lecture' && <Mot>Lecture…</Mot>}
        {etat.phase === 'binaire' && (
          <Mot>Fichier binaire. Git ne le compare pas ligne à ligne.</Mot>
        )}
        {etat.phase === 'trop' && (
          <Mot>
            Diff de plus de {(etat.octets / 1024 / 1024).toFixed(0)} Mo. Trop volumineux pour être
            affiché ici.
          </Mot>
        )}
        {etat.phase === 'vide' && <Mot>Aucune différence de ce côté.</Mot>}
        {etat.phase === 'lu' &&
          etat.diff.sections.map((section, rang) =>
            cote ? (
              <SectionCote key={rang} section={section} coupure={!entier} />
            ) : (
              <SectionUnifiee key={rang} section={section} coupure={!entier} />
            )
          )}
      </div>
    </div>
  )
}

const Mot = ({ children }: { children: React.ReactNode }): React.JSX.Element => (
  <p className="px-3 py-2 text-[12.5px] text-texte-faible">{children}</p>
)

const Bascule = ({
  actif,
  titre,
  onBasculer,
  children
}: {
  actif: boolean
  titre: string
  onBasculer: () => void
  children: React.ReactNode
}): React.JSX.Element => (
  <button
    type="button"
    onClick={onBasculer}
    title={titre}
    aria-pressed={actif}
    className="shrink-0 rounded px-2 py-0.5 font-mono text-[11px] text-texte-tenu transition-colors hover:text-texte"
  >
    {children}
  </button>
)

const Geste = ({
  titre,
  onClic,
  sens
}: {
  titre: string
  onClic: () => void
  sens: 'haut' | 'bas'
}): React.JSX.Element => (
  <button
    type="button"
    onClick={onClic}
    title={titre}
    aria-label={titre}
    className="flex h-6 w-6 items-center justify-center rounded text-texte-tenu transition-colors hover:bg-fond-survol hover:text-texte"
  >
    <span className={sens === 'haut' ? '-rotate-90' : 'rotate-90'}>
      <IconeChevron taille={13} />
    </span>
  </button>
)

/** La barre qui sépare deux sections, et dit où l'on se trouve dans le fichier. */
function Coupure({ section }: { section: Section }): React.JSX.Element {
  return (
    <div className="flex items-center gap-2 border-y border-separateur bg-fond-creux px-3 py-1 font-mono text-[10.5px] text-texte-tenu">
      <span>
        @@ {section.departGauche} → {section.departDroite}
      </span>
      {section.entete && <span className="truncate text-texte-faible">{section.entete}</span>}
    </div>
  )
}

const FONDS: Record<LigneDiff['genre'], string> = {
  contexte: '',
  retire: 'bg-erreur/12',
  ajoute: 'bg-succes/12'
}

const SIGNES: Record<LigneDiff['genre'], string> = {
  contexte: ' ',
  retire: '−',
  ajoute: '+'
}

/**
 * Ce qui ouvre un bloc changé porte le repère que suit la navigation.
 *
 * Seulement le premier d'un bloc : sans quoi vingt lignes remplacées d'un coup
 * vaudraient vingt arrêts.
 */
const repere = (debut: boolean): Record<string, string> => (debut ? { 'data-change': '' } : {})

function SectionUnifiee({
  section,
  coupure
}: {
  section: Section
  coupure: boolean
}): React.JSX.Element {
  return (
    <>
      {coupure && <Coupure section={section} />}
      <table className="w-full border-collapse font-mono text-[12px] leading-[1.5]">
        <tbody>
          {section.lignes.map((ligne, rang) => (
            <tr
              key={rang}
              className={FONDS[ligne.genre]}
              {...repere(
                ligne.genre !== 'contexte' &&
                  (rang === 0 || section.lignes[rang - 1]?.genre === 'contexte')
              )}
            >
              <Numero valeur={ligne.genre === 'ajoute' ? undefined : ligne.gauche} />
              <Numero valeur={ligne.genre === 'retire' ? undefined : ligne.droite} />
              <td className="w-4 pr-1 text-center text-texte-tenu select-none">
                {SIGNES[ligne.genre]}
              </td>
              <td className="pr-3 whitespace-pre text-texte-doux">{ligne.texte || ' '}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  )
}

function SectionCote({
  section,
  coupure
}: {
  section: Section
  coupure: boolean
}): React.JSX.Element {
  const paires = apparier(section)
  return (
    <>
      {coupure && <Coupure section={section} />}
      {/* Sans `table-fixed`, la table s'élargit pour ce qui dépasse et le
          conteneur la fait défiler. Fixée, elle écrêtait : une ligne minifiée
          ou un long littéral se perdait au-delà du bord, sans rien pour aller
          le voir. Les deux colonnes défilent ensemble, étant d'une même table. */}
      <table className="w-full border-collapse font-mono text-[12px] leading-[1.5]">
        <tbody>
          {paires.map((paire, rang) => {
            const change = paire.gauche?.genre !== 'contexte' || paire.droite?.genre !== 'contexte'
            const avant = paires[rang - 1]
            return (
              <tr
                key={rang}
                {...repere(change && (avant === undefined || avant.gauche?.genre === 'contexte'))}
              >
                <Cote ligne={paire.gauche} />
                {/* Les numéros au centre, comme dans le diff d'IntelliJ. Aux
                    extrémités, ils écartent les deux colonnes de code que l'œil
                    cherche justement à comparer. */}
                <Numero valeur={numeroGauche(paire.gauche)} bord="droite" />
                <Numero valeur={numeroDroite(paire.droite)} bord="gauche" />
                <Cote ligne={paire.droite} />
              </tr>
            )
          })}
        </tbody>
      </table>
    </>
  )
}

/** Une des deux colonnes. Vide quand la ligne n'a pas de vis-à-vis. */
function Cote({ ligne }: { ligne?: LigneDiff }): React.JSX.Element {
  return (
    <td
      className={`w-1/2 px-3 whitespace-pre text-texte-doux ${
        ligne ? FONDS[ligne.genre] : 'bg-fond-creux'
      }`}
    >
      {ligne ? ligne.texte || ' ' : ''}
    </td>
  )
}

/**
 * Un numéro de ligne.
 *
 * `select-none` le tient hors de la copie : sans lui, copier trois lignes d'un
 * diff rapporte trois numéros collés devant le code, et le collage est à
 * refaire à la main.
 */
const Numero = ({
  valeur,
  bord
}: {
  valeur?: number
  bord?: 'gauche' | 'droite'
}): React.JSX.Element => (
  <td
    className={`w-11 bg-fond-creux px-2 text-right align-top text-texte-tenu select-none ${
      bord === 'droite' ? 'border-l border-separateur' : ''
    } ${bord === 'gauche' ? 'border-r border-separateur' : ''}`}
  >
    {valeur ?? ''}
  </td>
)

/** Le numéro d'une ligne du côté où elle en a un. Une ligne ajoutée n'en a pas à gauche. */
const numeroGauche = (l?: LigneDiff): number | undefined =>
  l && l.genre !== 'ajoute' ? l.gauche : undefined

const numeroDroite = (l?: LigneDiff): number | undefined =>
  l && l.genre !== 'retire' ? l.droite : undefined
