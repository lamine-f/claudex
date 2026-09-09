import { useEffect, useRef, useState } from 'react'
import { apparier, compter, lireDiff, type LigneDiff, type Paire, type Section } from '@shared/diff'
import { estNonSuivi } from '@shared/git'
import { useStore } from '@renderer/state/store'
import { vueDiff } from '@renderer/state/vues'
import {
  IconeChevron,
  IconeCoteACote,
  IconeDeplier,
  IconeFermer,
  IconeReplier,
  IconeUnifie
} from '../ui/Icones'

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
 * Les hauteurs des deux sortes de rangées, en pixels.
 *
 * Elles sont dites plutôt que déduites du contenu. Les trois zones du diff
 * défilent ensemble mais sont trois tables distinctes : la moindre différence
 * de hauteur décale les numéros du code qu'ils désignent, et l'écart
 * s'accumule à chaque rangée.
 */
const HAUTEUR_LIGNE = 'h-[18px]'
const HAUTEUR_COUPURE = 'h-[22px]'

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

  const depots = useStore((e) => e.git?.depots)
  const ouvrirVue = useStore((e) => e.ouvrirVue)
  const fermerVue = useStore((e) => e.fermerVue)

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
   * Les fichiers voisins dans la page Git, et de quoi passer de l'un à l'autre.
   *
   * Le geste d'IntelliJ, qui annonce « 29/34 files » entre deux flèches. Sans
   * lui, relire trente fichiers demande de revenir à la liste après chacun.
   *
   * L'ordre est celui de la page : les suivis d'abord, les neufs ensuite, et
   * dans chaque section les dépôts puis leurs fichiers.
   */
  const voisins = ((): { rang: number; total: number; aller: (sens: 1 | -1) => void } => {
    const tous = (depots ?? []).flatMap((d) =>
      [...d.fichiers]
        .sort((a, b) => Number(estNonSuivi(a)) - Number(estNonSuivi(b)) || a.chemin.localeCompare(b.chemin))
        .map((f) => ({ depot: d, fichier: f }))
    )
    const rang = tous.findIndex((e) => e.depot.chemin === depot && e.fichier.chemin === fichier)

    return {
      rang: Math.max(0, rang),
      total: tous.length,
      aller: (sens) => {
        const cible = tous[rang + sens]
        if (!cible || rang < 0) return
        // La vue en cours cède la place : ouvrir sans fermer empilerait un
        // onglet par fichier parcouru.
        fermerVue(workspaceId, vueDiff(depot, nomDepot, fichier, { indexe, nonSuivi }).id)
        ouvrirVue(
          workspaceId,
          vueDiff(cible.depot.chemin, cible.depot.nom, cible.fichier.chemin, {
            indexe: cible.fichier.travail === 'inchange',
            nonSuivi: estNonSuivi(cible.fichier)
          })
        )
      }
    }
  })()

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
      {/* Des icônes rangées par famille, séparées par des filets, sur le modèle
          de la barre du diff d'IntelliJ. Quatre mots posés à la file disaient
          la même chose en pesant plus lourd que le nom du fichier. */}
      <div className="flex shrink-0 items-center gap-2 border-b border-separateur px-3 py-1.5">
        <span className="truncate text-[13px] text-texte">{fichier.split('/').pop()}</span>
        <span className="truncate font-mono text-[11px] text-texte-tenu">
          {nomDepot} · {fichier}
        </span>
        <div className="min-w-2 flex-1" />

        {mesure && (
          <span className="shrink-0 font-mono text-[11px] text-texte-faible">{mesure}</span>
        )}

        {/* Ce que la vue compare, dit en clair. Un même fichier a deux diffs
            selon le côté regardé, et rien d'autre ne les distingue à l'écran. */}
        <span className="shrink-0 font-mono text-[11px] text-texte-tenu">
          {nonSuivi ? 'fichier neuf' : indexe ? 'index → HEAD' : 'travail → index'}
        </span>

        {etat.phase === 'lu' && (
          <>
            <Filet />
            <Geste titre="Changement précédent" onClic={() => allerAuChangement(-1)}>
              <span className="-rotate-90">
                <IconeChevron taille={13} />
              </span>
            </Geste>
            <Geste titre="Changement suivant" onClic={() => allerAuChangement(1)}>
              <span className="rotate-90">
                <IconeChevron taille={13} />
              </span>
            </Geste>
          </>
        )}

        {voisins.total > 1 && (
          <>
            <Filet />
            <Geste
              titre="Fichier précédent"
              onClic={() => voisins.aller(-1)}
              inactif={voisins.rang === 0}
            >
              <span className="rotate-180">
                <IconeChevron taille={13} />
              </span>
            </Geste>
            <span className="shrink-0 font-mono text-[11px] whitespace-nowrap text-texte-faible">
              {voisins.rang + 1}/{voisins.total}
            </span>
            <Geste
              titre="Fichier suivant"
              onClic={() => voisins.aller(1)}
              inactif={voisins.rang === voisins.total - 1}
            >
              <IconeChevron taille={13} />
            </Geste>
          </>
        )}

        <Filet />
        <Geste
          titre={entier ? 'Ne montrer que les changements' : 'Montrer le fichier entier'}
          onClic={basculerEntier}
          enfonce={entier}
        >
          {entier ? <IconeReplier taille={14} /> : <IconeDeplier taille={14} />}
        </Geste>
        <Geste
          titre={cote ? 'Passer au diff d’un seul tenant' : 'Passer au diff côte à côte'}
          onClic={basculerCote}
          enfonce={cote}
        >
          {cote ? <IconeCoteACote taille={14} /> : <IconeUnifie taille={14} />}
        </Geste>

        <Filet />
        <Geste titre="Fermer la vue. Le fichier reste sur le disque." onClic={onFermer}>
          <IconeFermer taille={13} />
        </Geste>
      </div>

      {etat.phase !== 'lu' ? (
        <div aria-label="État du diff" className="min-h-0 flex-1 overflow-auto bg-fond-code">
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
        </div>
      ) : cote ? (
        <DeuxVolets sections={etat.diff.sections} coupures={!entier} zone={zone} />
      ) : (
        <div ref={zone} aria-label="Diff unifié" className="min-h-0 flex-1 overflow-auto bg-fond-code">
          {etat.diff.sections.map((section, rang) => (
            <SectionUnifiee key={rang} section={section} coupure={!entier} />
          ))}
        </div>
      )}
    </div>
  )
}

const Mot = ({ children }: { children: React.ReactNode }): React.JSX.Element => (
  <p className="px-3 py-2 text-[12.5px] text-texte-faible">{children}</p>
)

/** Le filet qui sépare deux familles de gestes. */
const Filet = (): React.JSX.Element => (
  <span aria-hidden className="mx-0.5 h-4 w-px shrink-0 bg-separateur" />
)

/**
 * Un geste de la barre, dit par son icône.
 *
 * L'intitulé reste en infobulle et pour l'accessibilité : ce qui disparaît est
 * l'encombrement, pas le sens.
 */
const Geste = ({
  titre,
  onClic,
  children,
  enfonce,
  inactif
}: {
  titre: string
  onClic: () => void
  children: React.ReactNode
  /** Vrai quand le geste dit un état en cours, non une action à faire. */
  enfonce?: boolean
  inactif?: boolean
}): React.JSX.Element => (
  <button
    type="button"
    onClick={onClic}
    disabled={inactif}
    title={titre}
    aria-label={titre}
    {...(enfonce === undefined ? {} : { 'aria-pressed': enfonce })}
    className={`flex h-6 w-6 shrink-0 items-center justify-center rounded transition-colors ${
      inactif
        ? 'text-texte-tenu opacity-30'
        : 'text-texte-faible hover:bg-fond-survol hover:text-texte'
    }`}
  >
    {children}
  </button>
)

/** La barre qui sépare deux sections, et dit où l'on se trouve dans le fichier. */
function Coupure({ section }: { section: Section }): React.JSX.Element {
  return (
    <div className="flex h-full items-center gap-2 border-y border-separateur bg-fond-code-marge px-3 font-mono text-[10.5px] text-texte-tenu">
      <span>
        @@ {section.departGauche} → {section.departDroite}
      </span>
      {section.entete && <span className="truncate text-texte-faible">{section.entete}</span>}
    </div>
  )
}

const FONDS: Record<LigneDiff['genre'], string> = {
  contexte: '',
  retire: 'bg-erreur/18',
  ajoute: 'bg-succes/18'
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
              className={`${HAUTEUR_LIGNE} ${FONDS[ligne.genre]}`}
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

/**
 * Les deux volets du diff côte à côte, et la gouttière des numéros entre eux.
 *
 * Trois zones plutôt qu'un tableau à quatre colonnes. C'est la forme
 * d'IntelliJ, et elle tient à une raison : chaque volet a son propre
 * défilement horizontal. Une ligne longue à gauche ne pousse pas le code de
 * droite hors de vue, et l'on va voir la fin de l'une sans perdre l'autre.
 *
 * Seul le défilement vertical est partagé, sans quoi les deux côtés cesseraient
 * de se faire face. La gouttière suit, mais ne défile jamais de côté : les
 * numéros restent en place quand le code glisse dessous.
 */
function DeuxVolets({
  sections,
  coupures,
  zone
}: {
  sections: Section[]
  coupures: boolean
  zone: React.MutableRefObject<HTMLDivElement | null>
}): React.JSX.Element {
  const droite = useRef<HTMLDivElement | null>(null)
  const gouttiere = useRef<HTMLDivElement | null>(null)
  // Recopier un défilement en déclenche un autre : sans ce garde, les deux
  // volets se renverraient la balle jusqu'à figer la fenêtre.
  const enCours = useRef(false)

  const suivre = (source: HTMLDivElement | null): void => {
    if (enCours.current || !source) return
    enCours.current = true
    for (const autre of [zone.current, droite.current, gouttiere.current]) {
      if (autre && autre !== source) autre.scrollTop = source.scrollTop
    }
    // Rendu à la boucle suivante : les événements de défilement des voisins
    // arrivent après le retour de celui-ci.
    requestAnimationFrame(() => {
      enCours.current = false
    })
  }

  // La coupure est une rangée de plus, non une rangée à la place. Posée à la
  // place, elle emportait la première ligne de chaque section : un diff d'une
  // seule ligne ne montrait que son en-tête.
  const rangees: Rangee[] = sections.flatMap((section) => {
    const paires = apparier(section)
    const lignes: Rangee[] = paires.map((paire, rang) => ({
      genre: 'ligne',
      paire,
      // Le repère que suit la navigation ne marque que la première ligne d'un
      // bloc : sinon vingt lignes remplacées vaudraient vingt arrêts.
      debut:
        (paire.gauche?.genre !== 'contexte' || paire.droite?.genre !== 'contexte') &&
        (rang === 0 || paires[rang - 1]?.gauche?.genre === 'contexte')
    }))
    return coupures ? [{ genre: 'coupure', section } as Rangee, ...lignes] : lignes
  })

  return (
    <div className="flex min-h-0 flex-1 bg-fond-code">
      <Volet cote="gauche" rangees={rangees} conteneur={zone} onDefiler={suivre} />

      {/* Les numéros ne défilent qu'en hauteur. Emportés par le glissement
          latéral d'un volet, ils quitteraient l'écran juste quand on cherche à
          savoir où l'on est. */}
      <div
        ref={gouttiere}
        aria-hidden
        className="shrink-0 overflow-hidden border-x border-separateur bg-fond-code-marge"
      >
        <table className="border-collapse font-mono text-[12px] leading-[1.5]">
          <tbody>
            {rangees.map((r, rang) =>
              r.genre === 'coupure' ? (
                <tr key={rang} className={HAUTEUR_COUPURE}>
                  <td className={HAUTEUR_COUPURE} colSpan={2} />
                </tr>
              ) : (
                <tr key={rang} className={HAUTEUR_LIGNE}>
                  <Numero valeur={numeroGauche(r.paire.gauche)} />
                  <Numero valeur={numeroDroite(r.paire.droite)} />
                </tr>
              )
            )}
          </tbody>
        </table>
      </div>

      <Volet cote="droite" rangees={rangees} conteneur={droite} onDefiler={suivre} />
    </div>
  )
}

/** Une rangée du diff côte à côte, telle que les trois zones la voient. */
type Rangee =
  | { genre: 'coupure'; section: Section }
  | { genre: 'ligne'; paire: Paire; debut: boolean }

/** Un des deux volets, avec son propre défilement latéral. */
function Volet({
  cote,
  rangees,
  conteneur,
  onDefiler
}: {
  cote: 'gauche' | 'droite'
  rangees: Rangee[]
  conteneur: React.MutableRefObject<HTMLDivElement | null>
  onDefiler: (source: HTMLDivElement | null) => void
}): React.JSX.Element {
  return (
    <div
      ref={conteneur}
      aria-label={cote === 'gauche' ? 'Volet gauche' : 'Volet droit'}
      onScroll={(e) => onDefiler(e.currentTarget)}
      className="min-w-0 flex-1 overflow-auto bg-fond-code"
    >
      {/* `min-w-full` et non `w-full` : la table remplit le volet quand le code
          est court, et s'élargit pour ce qui dépasse. Contrainte à la largeur
          du volet, elle écrêtait, et rien ne permettait d'aller voir la fin
          d'une ligne minifiée. */}
      <table className="min-w-full border-collapse font-mono text-[12px] leading-[1.5]">
        <tbody>
          {rangees.map((r, rang) => {
            if (r.genre === 'coupure') {
              return (
                <tr key={rang} className={HAUTEUR_COUPURE}>
                  <td className={`${HAUTEUR_COUPURE} overflow-hidden p-0`}>
                    <Coupure section={r.section} />
                  </td>
                </tr>
              )
            }
            const ligne = cote === 'gauche' ? r.paire.gauche : r.paire.droite
            return (
              <tr key={rang} className={HAUTEUR_LIGNE} {...repere(r.debut)}>
                <td
                  className={`${HAUTEUR_LIGNE} px-3 whitespace-pre text-texte-doux ${
                    ligne ? FONDS[ligne.genre] : 'bg-fond-code-marge'
                  }`}
                >
                  {ligne ? ligne.texte || ' ' : ' '}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
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
  <td className="w-11 px-2 text-right align-top text-texte-tenu select-none">{valeur ?? ''}</td>
)

/** Le numéro d'une ligne du côté où elle en a un. Une ligne ajoutée n'en a pas à gauche. */
const numeroGauche = (l?: LigneDiff): number | undefined =>
  l && l.genre !== 'ajoute' ? l.gauche : undefined

const numeroDroite = (l?: LigneDiff): number | undefined =>
  l && l.genre !== 'retire' ? l.droite : undefined
