import { useEffect } from 'react'
import { useStore } from '@renderer/state/store'

/**
 * Raccourcis globaux de l'application.
 *
 * Ils sont volontairement pris au niveau `document` en phase de capture : un
 * terminal xterm a le focus la plupart du temps et consommerait sinon les frappes.
 */
export function useShortcuts(): void {
  useEffect(() => {
    const surTouche = (evenement: KeyboardEvent): void => {
      if (!evenement.metaKey || evenement.ctrlKey) return
      const etat = useStore.getState()

      // ⌘T : nouveau terminal dans le workspace courant.
      if (evenement.key === 't') {
        evenement.preventDefault()
        void etat.nouvelOnglet()
        return
      }

      // ⌘E : basculer entre les conversations et les fichiers.
      if (evenement.key === 'e') {
        evenement.preventDefault()
        etat.choisirPanneau(etat.panneau === 'sessions' ? 'fichiers' : 'sessions')
        return
      }

      // ⌘W : fermer l'onglet courant, et avec lui sa session tmux.
      if (evenement.key === 'w') {
        evenement.preventDefault()
        if (etat.activeTabId) void etat.fermerOnglet(etat.activeTabId)
        return
      }

      // ⌘1..⌘9 : bascule directe entre projets.
      const rang = Number.parseInt(evenement.key, 10)
      if (Number.isInteger(rang) && rang >= 1 && rang <= 9) {
        const cible = etat.workspaces[rang - 1]
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
