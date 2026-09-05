import { describe, expect, it } from 'vitest'
import { dernierRegarde } from '../src/shared/onglets'

describe('dernier onglet regardé', () => {
  it('désigne le plus récemment visité, pas le dernier ouvert', () => {
    // C'est tout l'enjeu : le premier onglet est celui qu'on regardait, alors
    // que le troisième est le dernier de la barre.
    const onglets = [
      { id: 'a', lastActiveAt: 300 },
      { id: 'b', lastActiveAt: 100 },
      { id: 'c', lastActiveAt: 200 }
    ]
    expect(dernierRegarde(onglets)?.id).toBe('a')
  })

  it('départage deux dates identiques par le dernier ouvert', () => {
    const onglets = [
      { id: 'a', lastActiveAt: 100 },
      { id: 'b', lastActiveAt: 100 }
    ]
    expect(dernierRegarde(onglets)?.id).toBe('b')
  })

  it('ne désigne rien quand il n’y a pas d’onglet', () => {
    expect(dernierRegarde([])).toBeUndefined()
  })
})
