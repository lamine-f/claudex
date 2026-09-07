import { useEffect, useState } from 'react'
import { apparier, compter, lireDiff, type LigneDiff, type Section } from '@shared/diff'
import { useStore } from '@renderer/state/store'

/** Ce qui a été lu, ou la raison pour laquelle rien ne s'affiche. */
type Etat =
  | { phase: 'lecture' }
  | { phase: 'lu'; diff: ReturnType<typeof lireDiff> }
  | { phase: 'binaire' }
  | { phase: 'trop'; octets: number }
  | { phase: 'vide' }

/**
 * Le diff d'un fichier, côte à côte ou d'un seul tenant.
 *
 * Le format unifié porte déjà les numéros de ligne des deux côtés : la vue à
 * deux colonnes se construit à partir de lui, sans comparer quoi que ce soit
 * une seconde fois.
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
  const [etat, setEtat] = useState<Etat>({ phase: 'lecture' })

  useEffect(() => {
    let vivant = true
    setEtat({ phase: 'lecture' })
    void window.claudex.git
      .diff(workspaceId, depot, fichier, { indexe, nonSuivi })
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
  }, [workspaceId, depot, fichier, indexe, nonSuivi])

  const mesure =
    etat.phase === 'lu'
      ? (({ ajoutees, retirees }) => `+${ajoutees} −${retirees}`)(compter(etat.diff))
      : undefined

  return (
    <div className="flex h-full min-h-0 flex-col bg-fond">
      <div className="flex shrink-0 items-center gap-3 border-b border-separateur px-3 py-2">
        <span className="truncate text-[13px] text-texte">{fichier.split('/').pop()}</span>
        <span className="truncate font-mono text-[11px] text-texte-tenu">
          {nomDepot} · {fichier}
        </span>
        <div className="flex-1" />

        {mesure && <span className="shrink-0 font-mono text-[11px] text-texte-faible">{mesure}</span>}

        {/* Ce que la vue compare, dit en clair. Un même fichier a deux diffs
            selon le côté regardé, et rien d'autre ne les distingue à l'écran. */}
        <span className="shrink-0 font-mono text-[11px] text-texte-tenu">
          {nonSuivi ? 'fichier neuf' : indexe ? 'index → HEAD' : 'travail → index'}
        </span>

        <button
          type="button"
          onClick={basculerCote}
          title={cote ? 'Passer au diff d’un seul tenant' : 'Passer au diff côte à côte'}
          aria-pressed={cote}
          className="shrink-0 rounded px-2 py-0.5 font-mono text-[11px] text-texte-tenu transition-colors hover:text-texte"
        >
          {cote ? 'côte à côte' : 'unifié'}
        </button>

        <button
          type="button"
          onClick={onFermer}
          title="Fermer la vue. Le fichier reste sur le disque."
          className="shrink-0 rounded px-1.5 text-texte-tenu transition-colors hover:text-texte"
        >
          ✕
        </button>
      </div>

      <div aria-label="Contenu du diff" className="min-h-0 flex-1 overflow-auto">
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
              <SectionCote key={rang} section={section} />
            ) : (
              <SectionUnifiee key={rang} section={section} />
            )
          )}
      </div>
    </div>
  )
}

const Mot = ({ children }: { children: React.ReactNode }): React.JSX.Element => (
  <p className="px-3 py-2 text-[12.5px] text-texte-faible">{children}</p>
)

/** La barre qui sépare deux sections, et dit où l'on se trouve dans le fichier. */
function Coupure({ section }: { section: Section }): React.JSX.Element {
  return (
    <div className="flex items-center gap-2 border-y border-separateur bg-fond-creux px-3 py-1 font-mono text-[10.5px] text-texte-tenu">
      <span>@@ {section.departGauche} → {section.departDroite}</span>
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

function SectionUnifiee({ section }: { section: Section }): React.JSX.Element {
  return (
    <>
      <Coupure section={section} />
      <table className="w-full border-collapse font-mono text-[12px] leading-[1.5]">
        <tbody>
          {section.lignes.map((ligne, rang) => (
            <tr key={rang} className={FONDS[ligne.genre]}>
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

function SectionCote({ section }: { section: Section }): React.JSX.Element {
  return (
    <>
      <Coupure section={section} />
      {/* Sans `table-fixed`, la table s'élargit pour ce qui dépasse et le
          conteneur la fait défiler. Fixée, elle écrêtait : une ligne minifiée
          ou un long littéral se perdait au-delà du bord, sans rien pour aller
          le voir. Les deux colonnes défilent ensemble, étant d'une même table. */}
      <table className="w-full border-collapse font-mono text-[12px] leading-[1.5]">
        <tbody>
          {apparier(section).map((paire, rang) => (
            <tr key={rang}>
              <Cote ligne={paire.gauche} numero={numeroGauche(paire.gauche)} />
              <td className="w-px border-l border-separateur" />
              <Cote ligne={paire.droite} numero={numeroDroite(paire.droite)} />
            </tr>
          ))}
        </tbody>
      </table>
    </>
  )
}

/** Une des deux colonnes. Vide quand la ligne n'a pas de vis-à-vis. */
function Cote({ ligne, numero }: { ligne?: LigneDiff; numero?: number }): React.JSX.Element {
  return (
    <>
      <Numero valeur={numero} />
      <td
        className={`w-1/2 pr-3 whitespace-pre text-texte-doux ${
          ligne ? FONDS[ligne.genre] : 'bg-fond-creux'
        }`}
      >
        {ligne ? ligne.texte || ' ' : ''}
      </td>
    </>
  )
}

/**
 * Un numéro de ligne.
 *
 * `select-none` le tient hors de la copie : sans lui, copier trois lignes d'un
 * diff rapporte trois numéros collés devant le code, et le collage est à
 * refaire à la main.
 */
const Numero = ({ valeur }: { valeur?: number }): React.JSX.Element => (
  <td className="w-11 pr-2 text-right align-top text-texte-tenu select-none">{valeur ?? ''}</td>
)

/** Le numéro d'une ligne du côté où elle en a un. Une ligne ajoutée n'en a pas à gauche. */
const numeroGauche = (l?: LigneDiff): number | undefined =>
  l && l.genre !== 'ajoute' ? l.gauche : undefined

const numeroDroite = (l?: LigneDiff): number | undefined =>
  l && l.genre !== 'retire' ? l.droite : undefined
