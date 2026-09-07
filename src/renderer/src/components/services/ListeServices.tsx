import { useEffect, useMemo, useState } from 'react'
import type { EtatService, ServiceVu } from '@shared/types'
import { useStore } from '@renderer/state/store'
import { MenuContextuel, type Action } from '../ui/MenuContextuel'
import {
  IconeArreter,
  IconeDemarrer,
  IconeLiberer,
  IconeRelancer,
  IconeSkill
} from '../ui/Icones'

/**
 * Les services d'un projet, groupés.
 *
 * Ils ne sont pas dans la barre d'onglets, et c'est délibéré : un onglet répond
 * à « à qui je parle », un service à « qu'est-ce qui tourne ». Mêler les deux
 * abîmerait la lecture de la barre, qui est le repère principal.
 */

/** Ce que chaque état dit, et la couleur qui le dit. */
const ETATS: Record<EtatService, { mot: string; teinte: string; titre: string }> = {
  arrete: { mot: 'arrêté', teinte: 'bg-texte-tenu', titre: 'Rien ne tourne' },
  demarrage: {
    mot: 'démarre',
    teinte: 'bg-attention',
    titre: 'Sa session vit, son port ne répond pas encore'
  },
  vivant: { mot: 'en marche', teinte: 'bg-succes', titre: 'Il répond' },
  dehors: {
    mot: 'hors Claudex',
    teinte: 'bg-projet',
    titre: 'Son port répond, mais ce n’est pas Claudex qui l’a lancé'
  }
}

interface Props {
  workspaceId: string
  onVoirJournal: (service: ServiceVu) => void
}

export function ListeServices({ workspaceId, onVoirJournal }: Props): React.JSX.Element {
  const services = useStore((e) => e.services[workspaceId])
  const charger = useStore((e) => e.chargerServices)
  const demarrer = useStore((e) => e.demarrerServices)
  const arreter = useStore((e) => e.arreterServices)
  const liberer = useStore((e) => e.libererPort)
  const relancer = useStore((e) => e.relancerService)
  const reprendre = useStore((e) => e.reprendrePort)
  const [enCours, setEnCours] = useState<string[]>([])
  const [skillEcrit, setSkillEcrit] = useState<string | null>(null)
  const [menu, setMenu] = useState<{ x: number; y: number; actions: Action[] } | null>(null)
  const [echec, setEchec] = useState<string | null>(null)

  // Un démarrage passe par plusieurs états sans que personne ne le dise : on
  // relit tant que la colonne est à l'écran, et seulement tant qu'elle l'est.
  useEffect(() => {
    void charger(workspaceId)
    const minuterie = setInterval(() => void charger(workspaceId), 3000)
    return () => clearInterval(minuterie)
  }, [workspaceId, charger])

  const groupes = useMemo(() => {
    const par = new Map<string, ServiceVu[]>()
    for (const service of services ?? []) {
      const cle = service.groupe ?? 'sans groupe'
      par.set(cle, [...(par.get(cle) ?? []), service])
    }
    return [...par.entries()]
  }, [services])

  const agir = async (
    action: 'demarrer' | 'arreter' | 'liberer' | 'relancer' | 'reprendre',
    noms: string[]
  ): Promise<void> => {
    setEnCours((v) => [...v, ...noms])
    setEchec(null)
    try {
      const seul = { liberer, relancer, reprendre }[action as 'liberer' | 'relancer' | 'reprendre']
      if (seul) await Promise.all(noms.map((n) => seul(workspaceId, n)))
      else await (action === 'demarrer' ? demarrer : arreter)(workspaceId, noms)
    } catch (erreur) {
      // Une action qui échoue doit le dire. Sans cela, un geste sans effet est
      // indiscernable d'un geste qui n'a pas été reçu, et l'on clique en vain.
      // C'est arrivé pour de bon : le processus principal d'une session de
      // développement ignorait les commandes neuves, et rien ne le disait.
      setEchec(String((erreur as Error)?.message ?? erreur))
    } finally {
      setEnCours((v) => v.filter((n) => !noms.includes(n)))
    }
  }

  /**
   * Un geste, dit par son icône.
   *
   * Onze lignes portant chacune « démarrer » en toutes lettres pesaient plus que
   * ce qu'elles désignaient. L'intitulé reste, en infobulle et pour
   * l'accessibilité : ce qui disparaît est l'encombrement, pas le sens.
   */
  const geste = (
    libelle: string,
    titre: string,
    icone: React.ReactNode,
    onClic: () => void,
    accent = false
  ): React.JSX.Element => (
    <button
      type="button"
      title={titre}
      aria-label={libelle}
      onClick={onClic}
      className={`flex h-7 w-7 items-center justify-center rounded-md transition-colors ${
        accent
          ? 'text-texte-tenu hover:bg-fond-survol hover:text-accent'
          : 'text-texte-tenu hover:bg-fond-survol hover:text-texte'
      }`}
    >
      {icone}
    </button>
  )

  const bouton = (libelle: string, onClic: () => void, accent = false): React.JSX.Element =>
    ({
      démarrer: geste(
        'démarrer',
        'Lancer le service et journaliser sa sortie',
        <IconeDemarrer taille={15} />,
        onClic,
        true
      ),
      arrêter: geste(
        'arrêter',
        'Détruire la session du service',
        <IconeArreter taille={13} />,
        onClic
      ),
      relancer: geste(
        'relancer',
        'Arrêter puis redémarrer, pour reprendre un code qui a changé',
        <IconeRelancer taille={15} />,
        onClic,
        true
      ),
      libérer: geste(
        'libérer',
        'Tuer ce qui tient le port, sans rien lancer',
        <IconeLiberer taille={15} />,
        onClic
      ),
      reprendre: geste(
        'reprendre',
        'Tuer ce qui tient le port, puis démarrer le service sous Claudex',
        <IconeDemarrer taille={15} />,
        onClic,
        true
      ),
      'tout démarrer': geste(
        'tout démarrer',
        'Lancer tout le groupe, dans l’ordre de ses dépendances',
        <IconeDemarrer taille={15} />,
        onClic,
        true
      ),
      'tout arrêter': geste(
        'tout arrêter',
        'Arrêter tout le groupe',
        <IconeArreter taille={13} />,
        onClic
      ),
      'écrire le skill': geste(
        'écrire le skill',
        'Écrire le skill qui dit aux agents où sont les journaux',
        <IconeSkill taille={15} />,
        onClic
      )
    })[libelle] ?? <span />

  if (services === undefined) {
    return <p className="px-3 py-2 text-[12.5px] text-texte-faible">Lecture…</p>
  }

  if (services.length === 0) {
    return (
      <div className="px-3 py-2 text-[12.5px] leading-relaxed text-texte-faible">
        <p>Aucun service déclaré.</p>
        <p className="mt-2 text-texte-tenu">
          Décrivez-les dans <span className="font-mono">.claudex/services.yml</span>, à la racine
          du projet.
        </p>
      </div>
    )
  }

  /**
   * Écrit le skill qui dit aux agents où sont les journaux.
   *
   * Sur demande et non d'office : c'est un fichier qui entre dans le dépôt, et
   * Claudex n'ajoute rien au projet de quelqu'un sans qu'on le lui demande.
   */
  const ecrireSkill = async (): Promise<void> => {
    const chemin = await window.claudex.services.skill(workspaceId)
    setSkillEcrit(chemin)
    setTimeout(() => setSkillEcrit(null), 6000)
  }

  /**
   * Ce que le clic droit propose sur un service.
   *
   * Tuer ce qui tient le port y figure toujours, quel que soit l'état. Le bouton
   * de la ligne ne le montre que lorsqu'un autre tient le port, mais le cas
   * arrive aussi quand Claudex croit tenir un service qui n'a jamais démarré :
   * il faut alors pouvoir libérer sans deviner à quel état l'interface le range.
   */
  const actionsDe = (service: ServiceVu): Action[] => [
    { libelle: 'Voir le journal', onChoisir: () => onVoirJournal(service) },
    ...(service.etat === 'arrete'
      ? [{ libelle: 'Démarrer', onChoisir: () => void agir('demarrer', [service.nom]) }]
      : [
          { libelle: 'Relancer', onChoisir: () => void agir('relancer', [service.nom]) },
          { libelle: 'Arrêter', onChoisir: () => void agir('arreter', [service.nom]) }
        ]),
    ...(service.port !== undefined
      ? [
          {
            libelle: `Tuer le processus sur le port ${service.port}`,
            ecarte: true,
            onChoisir: () => void agir('liberer', [service.nom])
          },
          {
            libelle: 'Tuer, puis démarrer sous Claudex',
            onChoisir: () => void agir('reprendre', [service.nom])
          }
        ]
      : [])
  ]

  return (
    <>
      <div className="flex items-center gap-2 border-b border-separateur px-3 py-1.5">
        <span
          title={echec ?? undefined}
          className={`min-w-0 flex-1 truncate font-mono text-[10.5px] ${
            echec ? 'text-erreur' : 'text-texte-tenu'
          }`}
        >
          {echec
            ? echec
            : skillEcrit
              ? `skill écrit : ${skillEcrit.split(/[\\/]/).slice(-3).join('/')}`
              : ''}
        </span>
        {bouton('écrire le skill', () => void ecrireSkill())}
      </div>

    <ul className="pb-2">
      {groupes.map(([groupe, membres]) => {
        const noms = membres.map((s) => s.nom)
        const debout = membres.filter((s) => s.etat !== 'arrete').length
        return (
          <li key={groupe}>
            <div className="flex items-center gap-2 px-3 pt-3 pb-1">
              <span className="font-mono text-[10.5px] tracking-wide text-texte-tenu uppercase">
                {groupe}
              </span>
              <span className="font-mono text-[10.5px] text-texte-tenu">
                {debout}/{membres.length}
              </span>
              <div className="flex-1" />
              {bouton('tout démarrer', () => void agir('demarrer', noms), true)}
              {bouton('tout arrêter', () => void agir('arreter', noms))}
            </div>

            <ul>
              {membres.map((service) => {
                const etat = ETATS[service.etat]
                const occupe = enCours.includes(service.nom)
                return (
                  <li
                    key={service.nom}
                    onContextMenu={(e) => {
                      e.preventDefault()
                      setMenu({ x: e.clientX, y: e.clientY, actions: actionsDe(service) })
                    }}
                    className="relative border-l-2 border-l-separateur transition-colors hover:border-l-bordure hover:bg-fond-survol"
                  >
                    {/* Toute la surface ouvre le journal, comme une ligne de
                        conversation ouvre la sienne. Les gestes se posent
                        par-dessus : un bouton ne s'imbrique pas dans un bouton,
                        et la place leur est réservée à droite. */}
                    {/* Hors du bouton : dedans, son intitulé passait devant le
                        nom du service dans ce que la ligne annonce. */}
                    <span
                      aria-label={etat.mot}
                      title={etat.titre}
                      className={`absolute top-[17px] left-3.5 h-[7px] w-[7px] rounded-full ${
                        etat.teinte
                      } ${occupe ? 'animate-pulse' : ''}`}
                    />

                    <button
                      type="button"
                      onClick={() => onVoirJournal(service)}
                      title="Voir son journal"
                      className="flex w-full flex-col gap-1 py-2.5 pr-[74px] pl-8 text-left"
                    >
                      <span className="min-w-0 truncate text-[14px] text-texte-doux">
                        {service.nom}
                      </span>

                      {/* Ce qu'on veut savoir sans ouvrir le journal : où il en
                          est, sur quel port, et ce qui cloche s'il y a lieu. */}
                      <span className="flex items-center gap-1.5 overflow-hidden font-mono text-[11.5px] whitespace-nowrap text-texte-tenu">
                        <span>{etat.mot}</span>
                        {service.port !== undefined && <span>· {service.port}</span>}
                        {service.reproche && (
                          <span title={service.reproche} className="truncate text-attention">
                            · {service.reproche}
                          </span>
                        )}
                      </span>
                    </button>

                    <span className="absolute top-1/2 right-2 flex -translate-y-1/2 items-center gap-0.5">
                      {service.etat === 'dehors' && (
                        <>
                          {bouton('reprendre', () => void agir('reprendre', [service.nom]), true)}
                          {bouton('libérer', () => void agir('liberer', [service.nom]))}
                        </>
                      )}
                      {service.etat === 'arrete' &&
                        bouton('démarrer', () => void agir('demarrer', [service.nom]), true)}
                      {(service.etat === 'vivant' || service.etat === 'demarrage') && (
                        <>
                          {bouton('relancer', () => void agir('relancer', [service.nom]), true)}
                          {bouton('arrêter', () => void agir('arreter', [service.nom]))}
                        </>
                      )}
                    </span>
                  </li>
                )
              })}
            </ul>
          </li>
        )
      })}
    </ul>

    {menu && (
      <MenuContextuel
        x={menu.x}
        y={menu.y}
        actions={menu.actions}
        intitule="Actions du service"
        onFermer={() => setMenu(null)}
      />
    )}
    </>
  )
}
