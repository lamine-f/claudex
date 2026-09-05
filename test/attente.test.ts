import { describe, expect, it } from 'vitest'
import { borner } from '../src/shared/attente'

const apres = <T>(ms: number, valeur: T): Promise<T> =>
  new Promise((resoudre) => setTimeout(() => resoudre(valeur), ms))

describe('borner', () => {
  it('rend la valeur quand la promesse arrive à temps', async () => {
    expect(await borner(apres(5, 'à temps'), 500, 'écoulé')).toBe('à temps')
  })

  it("rend la valeur de repli quand le délai s'écoule", async () => {
    expect(await borner(apres(500, 'trop tard'), 5, 'écoulé')).toBe('écoulé')
  })

  it('traite un rejet comme un échec, sans le laisser remonter', async () => {
    expect(await borner(Promise.reject(new Error('cassé')), 500, 'écoulé')).toBe('écoulé')
  })

  // Une promesse qui ne se règle jamais est le cas qui a motivé la fonction.
  it("n'attend pas une promesse qui ne se règle jamais", async () => {
    expect(await borner(new Promise<string>(() => {}), 5, 'écoulé')).toBe('écoulé')
  })
})
