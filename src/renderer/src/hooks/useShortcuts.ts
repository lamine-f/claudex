import { useEffect } from 'react'
import { estRaccourci } from '@renderer/plateforme'
import { useStore } from '@renderer/state/store'

/**
 * Raccourcis globaux de l'application.
 *
 * Ils sont volontairement pris au niveau `document` en phase de capture : un
 * terminal xterm a le focus la plupart du temps et consommerait sinon les frappes.
 *
 * La combinaison qui les déclenche dépend du système, et `@shared/plateforme`
 * en décide : Commande sur macOS, Contrôle+Majuscule ailleurs, où Contrôle seul
 * revient au shell.
 */
export function useShortcuts(): void {
  useEffect(() => {
    const surTouche = (evenement: KeyboardEvent): void => {
      if (!estRaccourci(evenement)) return
      const etat = useStore.getState()

      // La Majuscule tenue change `key` : la lettre arrive en capitale. La
      // comparaison se fait donc en minuscule, sur la touche que porte le
      // clavier — et non sur `code`, qui désignerait une autre lettre en azerty.
      const lettre = evenement.key.toLowerCase()

      // Nouveau terminal dans le workspace courant.
      if (lettre === 't') {
        evenement.preventDefault()
        void etat.nouvelOnglet()
        return
      }

      // Basculer entre les conversations et les fichiers.
      if (lettre === 'e') {
        evenement.preventDefault()
        etat.choisirPanneau(etat.panneau === 'sessions' ? 'fichiers' : 'sessions')
        return
      }

      // Fermer l'onglet courant, et avec lui sa session tmux.
      if (lettre === 'w') {
        evenement.preventDefault()
        if (etat.activeTabId) void etat.fermerOnglet(etat.activeTabId)
        return
      }

      // Bascule directe entre projets. Les chiffres se lisent sur `code` : avec
      // la Majuscule tenue, `key` rapporte le symbole de la touche — « ! » pour
      // le 1 — et sur un clavier français il le rapporte même sans Majuscule.
      const chiffre = /^Digit([1-9])$/.exec(evenement.code)
      if (chiffre) {
        const cible = etat.workspaces[Number(chiffre[1]) - 1]
        if (cible) {
          evenement.preventDefault()
          void etat.choisirWorkspace(cible.id)
        }
      }
    }

    document.addEventListener('keydown', surTouche, true)
    return () => document.removeEventListener('keydown', surTouche, true)
  }, [])
}
