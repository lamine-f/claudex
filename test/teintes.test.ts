import { describe, expect, it } from 'vitest'
import { TEINTES, teintePour } from '../src/shared/teintes'

describe('teinte de ce qui est ouvert', () => {
  it('donne une teinte différente à chacun', () => {
    // Deux éléments ouverts en même temps doivent se distinguer : c'est tout
    // l'objet de la marque.
    const ouverts = ['a', 'b', 'c']
    const teintes = ouverts.map((id) => teintePour(id, ouverts))
    expect(new Set(teintes).size).toBe(3)
  })

  it('ne donne rien à ce qui n’est pas ouvert', () => {
    expect(teintePour('absent', ['a', 'b'])).toBeUndefined()
  })

  it('recommence la palette au-delà de six', () => {
    const ouverts = Array.from({ length: 8 }, (_, n) => `t${n}`)
    expect(teintePour('t6', ouverts)).toBe(teintePour('t0', ouverts))
    expect(teintePour('t7', ouverts)).toBe(teintePour('t1', ouverts))
  })

  it('suit le rang, non l’identifiant', () => {
    // Fermer ce qui précède décale les teintes. C'est le prix de la garantie
    // qu'aucun couple ouvert ensemble ne partage la même.
    expect(teintePour('b', ['a', 'b'])).toBe(TEINTES[1])
    expect(teintePour('b', ['b'])).toBe(TEINTES[0])
  })
})
