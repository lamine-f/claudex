import { describe, expect, it } from 'vitest'
import { estCommande, libelleRaccourci, type Modificateurs } from '../src/shared/plateforme'

/** Un événement clavier réduit à ce que la décision regarde. */
const touche = (mods: Partial<Modificateurs>): Modificateurs => ({
  metaKey: false,
  ctrlKey: false,
  shiftKey: false,
  ...mods
})

describe('estCommande', () => {
  describe('sur macOS', () => {
    it('répond à Commande seule', () => {
      expect(estCommande(touche({ metaKey: true }), 'darwin')).toBe(true)
    })

    it('laisse Contrôle au terminal', () => {
      expect(estCommande(touche({ ctrlKey: true }), 'darwin')).toBe(false)
      expect(estCommande(touche({ ctrlKey: true, shiftKey: true }), 'darwin')).toBe(false)
    })

    it('ignore Commande quand Contrôle est aussi tenu', () => {
      expect(estCommande(touche({ metaKey: true, ctrlKey: true }), 'darwin')).toBe(false)
    })
  })

  describe('ailleurs', () => {
    it('répond à Contrôle et Majuscule', () => {
      expect(estCommande(touche({ ctrlKey: true, shiftKey: true }), 'linux')).toBe(true)
    })

    // Le cas qui a imposé la Majuscule : Contrôle+W efface le mot précédent dans
    // un shell. S'il fermait l'onglet, il emporterait la session tmux avec lui.
    it('laisse Contrôle seul au terminal', () => {
      expect(estCommande(touche({ ctrlKey: true }), 'linux')).toBe(false)
    })

    it('ignore la touche Super, que le gestionnaire de fenêtres se réserve', () => {
      expect(estCommande(touche({ metaKey: true, shiftKey: true }), 'linux')).toBe(false)
      expect(estCommande(touche({ ctrlKey: true, shiftKey: true, metaKey: true }), 'linux')).toBe(
        false
      )
    })
  })

  it('traite une plateforme inconnue comme les non-macOS', () => {
    expect(estCommande(touche({ ctrlKey: true, shiftKey: true }), 'win32')).toBe(true)
    expect(estCommande(touche({ metaKey: true }), 'win32')).toBe(false)
  })
})

describe('libelleRaccourci', () => {
  it('suit la plateforme', () => {
    expect(libelleRaccourci('T', 'darwin')).toBe('⌘T')
    expect(libelleRaccourci('T', 'linux')).toBe('Ctrl+Maj+T')
  })
})
