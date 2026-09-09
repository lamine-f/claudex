import { describe, expect, it } from 'vitest'
import { construirePrompt, nettoyer, tronquer } from '../src/shared/message-commit'

const apport = {
  nom: 'olive_core',
  stat: ' src/Lien.java | 4 ++--\n 1 file changed',
  diff: '--- a/src/Lien.java\n+++ b/src/Lien.java\n-ancien\n+neuf',
  tronque: false
}

describe('prompt de rédaction', () => {
  it('montre les derniers commits comme modèle', () => {
    // Les règles écrites ne portent ni la langue ni le ton. Les exemples, si.
    const prompt = construirePrompt([apport], ['fix(pdf): affine le pied de page'])

    expect(prompt).toContain('fix(pdf): affine le pied de page')
    expect(prompt).toContain('derniers commits de ce dépôt')
    expect(prompt.indexOf('derniers commits')).toBeLessThan(prompt.indexOf('Ce qui change'))
  })

  it('se passe d’exemples quand le dépôt n’a pas d’histoire', () => {
    const prompt = construirePrompt([apport], [])
    expect(prompt).not.toContain('derniers commits')
    expect(prompt).toContain('src/Lien.java')
  })

  it('porte le compte des changements même quand le diff est coupé', () => {
    // L'ampleur se lit dans le `--stat`, qui reste entier. Sans lui, un diff
    // coupé ferait croire à un petit changement.
    const prompt = construirePrompt([{ ...apport, tronque: true }], [])
    expect(prompt).toContain('1 file changed')
    expect(prompt).toContain('coupé')
  })

  it('demande un seul message quand plusieurs dépôts sont touchés', () => {
    // C'est un seul message qui sera écrit dans chacun.
    const prompt = construirePrompt([apport, { ...apport, nom: 'olive_front' }], [])
    expect(prompt).toContain('Dépôt olive_core')
    expect(prompt).toContain('Dépôt olive_front')
    expect(prompt).toContain('Un seul message')
  })

  it('ne parle pas de plusieurs dépôts quand il n’y en a qu’un', () => {
    expect(construirePrompt([apport], [])).not.toContain('Un seul message')
  })
})

describe('troncature du diff', () => {
  it('laisse un diff court intact', () => {
    expect(tronquer('court', 100)).toEqual({ texte: 'court', tronque: false })
  })

  it('coupe à une fin de ligne, non au milieu', () => {
    // Un fragment de ligne ressemble à du code sans en être.
    const lu = tronquer('une ligne\ndeux lignes\ntrois lignes', 15)
    expect(lu.texte).toBe('une ligne')
    expect(lu.tronque).toBe(true)
  })

  it('coupe quand même quand aucune ligne ne finit avant la limite', () => {
    const lu = tronquer('a'.repeat(50), 10)
    expect(lu.texte).toHaveLength(10)
    expect(lu.tronque).toBe(true)
  })
})

describe('nettoyage de la réponse', () => {
  it('retire le bloc de code qui enveloppe tout', () => {
    // L'agent en pose un malgré la consigne, et il finirait dans le champ.
    expect(nettoyer('```\nfix: quelque chose\n\nUn corps.\n```')).toBe(
      'fix: quelque chose\n\nUn corps.'
    )
  })

  it('retire un bloc de code étiqueté', () => {
    expect(nettoyer('```text\nfix: quelque chose\n```')).toBe('fix: quelque chose')
  })

  it('garde un message qui n’a pas d’emballage', () => {
    const message = 'feat(git): ajoute la page des changements\n\nUn corps qui explique.'
    expect(nettoyer(message)).toBe(message)
  })

  it('garde les blocs de code qui sont dans le corps', () => {
    // Un message peut citer une commande. Seul l'emballage se retire.
    const message = 'chore: change la commande\n\n```sh\nnpm run dist\n```'
    expect(nettoyer(message)).toBe(message)
  })

  it('écarte une phrase d’introduction', () => {
    const rendu =
      'Voici le message de commit que je propose pour ces changements, au format du dépôt.\n\nfix: corrige le décalage'
    expect(nettoyer(rendu)).toBe('fix: corrige le décalage')
  })
})
