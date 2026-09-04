import { useEffect } from 'react'
import { estCommande } from '@shared/raccourcis'
import { useStore } from '@renderer/state/store'
import { SUR_MAC, PLATEFORME } from '@renderer/systeme'

/**
 * Raccourcis globaux de l'application.
 *
 * Ils sont volontairement pris au niveau `document` en phase de capture : un
 * terminal xterm a le focus la plupart du temps et consommerait sinon les frappes.
 */
export function useShortcuts(): void {
  useEffect(() => {
    /**
     * Vrai quand la frappe s'adresse à l'application et non au terminal.
     *
     * Sur macOS, Commande est libre : le shell ne s'en sert pas. Sur Windows il
     * n'existe pas d'équivalent, et `Ctrl+E` comme `Ctrl+W` ont déjà un sens dans
     * la ligne de commande. Y ajouter Majuscule les rend à l'application sans
     * rien retirer au terminal, comme le font Windows Terminal et VS Code.
     */
    const pourLApplication = (evenement: KeyboardEvent): boolean =>
      estCommande(evenement, PLATEFORME)

    const surTouche = (evenement: KeyboardEvent): void => {
      const etat = useStore.getState()

      // Les chiffres se passent de Majuscule : le shell ne les revendique pas, et
      // `Ctrl+Maj+1` ne donne pas partout le même `key` selon la disposition.
      if (!SUR_MAC && evenement.ctrlKey && !evenement.shiftKey && !evenement.metaKey) {
        basculerProjet(evenement, etat)
        return
      }

      if (!pourLApplication(evenement)) return

      // Majuscule change la casse de `key` : on compare sur une base commune.
      const touche = evenement.key.toLowerCase()

      // ⌘T / Ctrl+Maj+T : nouveau terminal dans le workspace courant.
      if (touche === 't') {
        evenement.preventDefault()
        void etat.nouvelOnglet()
        return
      }

      // ⌘E / Ctrl+Maj+E : basculer entre les conversations et les fichiers.
      if (touche === 'e') {
        evenement.preventDefault()
        etat.choisirPanneau(etat.panneau === 'sessions' ? 'fichiers' : 'sessions')
        return
      }

      // ⌘W / Ctrl+Maj+W : fermer l'onglet courant, et avec lui sa session.
      if (touche === 'w') {
        evenement.preventDefault()
        if (etat.activeTabId) void etat.fermerOnglet(etat.activeTabId)
        return
      }

      if (SUR_MAC) basculerProjet(evenement, etat)
    }

    document.addEventListener('keydown', surTouche, true)
    return () => document.removeEventListener('keydown', surTouche, true)
  }, [])
}

/** ⌘1..⌘9, Ctrl+1..Ctrl+9 : bascule directe entre projets. */
function basculerProjet(
  evenement: KeyboardEvent,
  etat: ReturnType<typeof useStore.getState>
): void {
  // Le chiffre se lit sur `code` et non sur `key` : sur un clavier français,
  // la rangée des chiffres rapporte « & é " » tant que Majuscule n'est pas
  // tenue, et le raccourci ne partait jamais. Le défaut valait aussi sur macOS.
  const chiffre = /^Digit([1-9])$/.exec(evenement.code)
  if (!chiffre) return
  const cible = etat.workspaces[Number(chiffre[1]) - 1]
  if (!cible) return
  evenement.preventDefault()
  void etat.choisirWorkspace(cible.id)
}
