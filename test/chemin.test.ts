import { describe, expect, it } from 'vitest'
import { fusionner } from '../src/main/util/chemin'

describe('fusion des chemins', () => {
  it("garde l'ordre de l'existant et ajoute ce qui manque", () => {
    expect(fusionner('/usr/bin:/bin', ['/opt/homebrew/bin', '/usr/bin'])).toBe(
      '/usr/bin:/bin:/opt/homebrew/bin'
    )
  })

  it('ne répète jamais un dossier', () => {
    const chemin = fusionner('/a:/b', ['/b', '/a', '/c', '/c'])
    expect(chemin).toBe('/a:/b:/c')
  })

  it('supporte un PATH absent', () => {
    expect(fusionner(undefined, ['/opt/homebrew/bin'])).toBe('/opt/homebrew/bin')
  })

  it('ignore les séparateurs vides, qui désignent le dossier courant', () => {
    // Un PATH qui se termine par « : » ajoute le répertoire courant à la
    // recherche : c'est un piège de sécurité classique, et rien ici n'en a besoin.
    expect(fusionner('/a::/b:', [])).toBe('/a:/b')
  })
})
