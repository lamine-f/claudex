import { describe, expect, it } from 'vitest'
import { nommerBranche, racine } from '../src/shared/branches'

describe('nommage des branches', () => {
  it("préfixe par l'origine", () => {
    expect(nommerBranche('Hello world', 'sans le cache')).toBe('Hello world -- sans le cache')
  })

  it("n'empile pas les préfixes en cascade", () => {
    // Le cas observé : trois bifurcations successives donnaient
    // « Nouvel agent -- test -- test 2 », illisible et sans information de plus.
    const première = nommerBranche('Nouvel agent', 'test')
    const seconde = nommerBranche(première, 'test 2')
    expect(seconde).toBe('Nouvel agent -- test 2')
    expect(nommerBranche(seconde, 'test 3')).toBe('Nouvel agent -- test 3')
  })

  it('remplace une saisie vide par un mot neutre', () => {
    expect(nommerBranche('Hello world', '   ')).toBe('Hello world -- branche')
  })

  it("rend le nom entier quand il n'y a pas de séparateur", () => {
    expect(racine('Erreur de capture réseau')).toBe('Erreur de capture réseau')
  })
})
