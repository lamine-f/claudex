import { describe, expect, it } from 'vitest'
import { rangerSelon, reordonner } from '../src/shared/ordre'

describe('reordonner', () => {
  const liste = ['a', 'b', 'c', 'd']

  it('remonte une ligne au-dessus d’une autre', () => {
    expect(reordonner(liste, 'd', 'b', 'avant')).toEqual(['a', 'd', 'b', 'c'])
  })

  it('descend une ligne en dessous d’une autre', () => {
    // Le rang de « c » est 2 dans la liste d'origine, mais 1 une fois « a »
    // retiré : compter avant le retrait aurait placé « a » après « d ».
    expect(reordonner(liste, 'a', 'c', 'apres')).toEqual(['b', 'c', 'a', 'd'])
  })

  it('mène en tête et en queue', () => {
    expect(reordonner(liste, 'c', 'a', 'avant')).toEqual(['c', 'a', 'b', 'd'])
    expect(reordonner(liste, 'b', 'd', 'apres')).toEqual(['a', 'c', 'd', 'b'])
  })

  it('ne bouge rien quand la ligne retombe où elle était', () => {
    expect(reordonner(liste, 'b', 'a', 'apres')).toEqual(liste)
    expect(reordonner(liste, 'b', 'c', 'avant')).toEqual(liste)
  })

  it('ignore un dépôt sur soi-même ou sur un inconnu', () => {
    expect(reordonner(liste, 'b', 'b', 'avant')).toEqual(liste)
    expect(reordonner(liste, 'z', 'b', 'avant')).toEqual(liste)
    expect(reordonner(liste, 'b', 'z', 'apres')).toEqual(liste)
  })
})

describe('rangerSelon', () => {
  const projets = [{ id: 'a' }, { id: 'b' }, { id: 'c' }]

  it('suit l’ordre donné', () => {
    expect(rangerSelon(projets, ['c', 'a', 'b'])).toEqual([{ id: 'c' }, { id: 'a' }, { id: 'b' }])
  })

  it('garde en fin de liste ce que l’ordre ne cite pas', () => {
    expect(rangerSelon(projets, ['c'])).toEqual([{ id: 'c' }, { id: 'a' }, { id: 'b' }])
  })

  it('écarte les identifiants qui ne désignent rien', () => {
    expect(rangerSelon(projets, ['z', 'b'])).toEqual([{ id: 'b' }, { id: 'a' }, { id: 'c' }])
  })
})
