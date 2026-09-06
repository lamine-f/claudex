import { useEffect, useMemo, useState } from 'react'
import type { EtatService, ServiceVu } from '@shared/types'
import { useStore } from '@renderer/state/store'

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
  const [enCours, setEnCours] = useState<string[]>([])
  const [skillEcrit, setSkillEcrit] = useState<string | null>(null)

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
    action: 'demarrer' | 'arreter' | 'liberer',
    noms: string[]
  ): Promise<void> => {
    setEnCours((v) => [...v, ...noms])
    try {
      if (action === 'liberer') await Promise.all(noms.map((n) => liberer(workspaceId, n)))
      else await (action === 'demarrer' ? demarrer : arreter)(workspaceId, noms)
    } finally {
      setEnCours((v) => v.filter((n) => !noms.includes(n)))
    }
  }

  const bouton = (libelle: string, onClic: () => void, accent = false): React.JSX.Element => (
    <button
      type="button"
      onClick={onClic}
      className={`rounded px-2 py-0.5 font-mono text-[10.5px] transition-colors ${
        accent
          ? 'text-texte-faible hover:bg-fond-survol hover:text-accent'
          : 'text-texte-tenu hover:bg-fond-survol hover:text-texte'
      }`}
    >
      {libelle}
    </button>
  )

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

  return (
    <>
      <div className="flex items-center gap-2 border-b border-separateur px-3 py-1.5">
        <span className="min-w-0 flex-1 truncate font-mono text-[10.5px] text-texte-tenu">
          {skillEcrit ? `skill écrit : ${skillEcrit.split(/[\\/]/).slice(-3).join('/')}` : ''}
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
                    className="flex items-center gap-2.5 px-3 py-1.5 hover:bg-fond-survol"
                  >
                    <span
                      aria-label={etat.mot}
                      title={etat.titre}
                      className={`h-[7px] w-[7px] shrink-0 rounded-full ${etat.teinte} ${
                        occupe ? 'animate-pulse' : ''
                      }`}
                    />
                    <button
                      type="button"
                      onClick={() => onVoirJournal(service)}
                      title="Voir son journal"
                      className="min-w-0 flex-1 truncate text-left text-[13.5px] text-texte-doux hover:text-texte"
                    >
                      {service.nom}
                    </button>

                    {service.port !== undefined && (
                      <span className="shrink-0 font-mono text-[10.5px] text-texte-tenu">
                        {service.port}
                      </span>
                    )}

                    {/* Toujours visible, jamais au survol : dans un panneau de
                        pilotage, démarrer et arrêter sont ce qu'on vient y faire,
                        et les cacher oblige à les chercher. */}
                    <span className="flex shrink-0 items-center gap-0.5">
                      {/* Le port est tenu par quelqu'un d'autre : « arrêter » ne
                          peut rien, n'ayant aucune session à détruire. Le
                          libérer est le seul geste qui vaille. */}
                      {service.etat === 'dehors' &&
                        bouton('libérer le port', () => void agir('liberer', [service.nom]))}
                      {service.etat === 'arrete'
                        ? bouton('démarrer', () => void agir('demarrer', [service.nom]), true)
                        : service.etat !== 'dehors' &&
                          bouton('arrêter', () => void agir('arreter', [service.nom]))}
                    </span>

                    {service.reproche && (
                      <span
                        aria-label="Déclaration incomplète"
                        title={service.reproche}
                        className="shrink-0 font-mono text-[11px] text-attention"
                      >
                        !
                      </span>
                    )}
                  </li>
                )
              })}
            </ul>
          </li>
        )
      })}
    </ul>
    </>
  )
}
