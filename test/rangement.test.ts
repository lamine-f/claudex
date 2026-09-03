import { describe, expect, it } from 'vitest'
import type { ClaudeSession } from '../src/shared/types'
import {
  RANGEMENT_VIDE,
  assembler,
  creerGroupe,
  deplacer,
  dissoudreGroupe,
  materialiser,
  oublier,
  renommerGroupe,
  type Rangement
} from '../src/shared/rangement'

/** Conversations factices, de la plus récente à la plus ancienne. */
function sessions(...ids: string[]): ClaudeSession[] {
  return ids.map((id, rang) => ({
    id,
    titre: id,
    titreDeRepli: false,
    misAJourLe: 1000 - rang,
    octets: 0,
    epinglee: false
  }))
}

/** Ce que la colonne affiche, à plat, pour comparer d'un coup d'œil. */
function affiche(lignes: ReturnType<typeof assembler>): string[] {
  return lignes.flatMap((ligne) =>
    ligne.type === 'session'
      ? [ligne.session.id]
      : [`[${ligne.nom}]`, ...ligne.sessions.map((s) => `  ${s.id}`)]
  )
}

describe('rangement des conversations', () => {
  it("laisse l'ordre du disque tant que rien n'a été rangé", () => {
    expect(affiche(assembler(sessions('a', 'b', 'c'), RANGEMENT_VIDE))).toEqual(['a', 'b', 'c'])
  })

  it('respecte ce qui a été rangé à la main', () => {
    const range = materialiser(sessions('a', 'b', 'c'), RANGEMENT_VIDE)
    const apres = deplacer(range, { type: 'session', id: 'c' }, { groupe: null, index: 0 })
    expect(affiche(assembler(sessions('a', 'b', 'c'), apres))).toEqual(['c', 'a', 'b'])
  })

  it('descendre une conversation la place bien après sa voisine', () => {
    // Le rang visé est celui d'avant le retrait : sans correction, « a » posé
    // au rang 2 atterrirait après « c » au lieu d'après « b ».
    const range = materialiser(sessions('a', 'b', 'c'), RANGEMENT_VIDE)
    const apres = deplacer(range, { type: 'session', id: 'a' }, { groupe: null, index: 2 })
    expect(affiche(assembler(sessions('a', 'b', 'c'), apres))).toEqual(['b', 'a', 'c'])
  })

  it('fait passer devant une conversation apparue depuis', () => {
    const range = materialiser(sessions('a', 'b'), RANGEMENT_VIDE)
    expect(affiche(assembler(sessions('neuve', 'a', 'b'), range))).toEqual(['neuve', 'a', 'b'])
  })

  it('range une conversation dans un groupe', () => {
    let r: Rangement = materialiser(sessions('a', 'b', 'c'), RANGEMENT_VIDE)
    r = creerGroupe(r, 'g1', 'Attestation')
    r = deplacer(r, { type: 'session', id: 'b' }, { groupe: 'g1', index: 0 })
    expect(affiche(assembler(sessions('a', 'b', 'c'), r))).toEqual([
      '[Attestation]',
      '  b',
      'a',
      'c'
    ])
  })

  it('ressort une conversation de son groupe', () => {
    let r = creerGroupe(materialiser(sessions('a', 'b'), RANGEMENT_VIDE), 'g1', 'G', 0, ['a'])
    r = deplacer(r, { type: 'session', id: 'a' }, { groupe: null, index: 2 })
    expect(affiche(assembler(sessions('a', 'b'), r))).toEqual(['[G]', 'b', 'a'])
  })

  it('déplace un groupe entier, son contenu avec lui', () => {
    let r = creerGroupe(materialiser(sessions('a', 'b', 'c'), RANGEMENT_VIDE), 'g1', 'G', 0, ['a'])
    r = deplacer(r, { type: 'groupe', id: 'g1' }, { groupe: null, index: 3 })
    expect(affiche(assembler(sessions('a', 'b', 'c'), r))).toEqual(['b', 'c', '[G]', '  a'])
  })

  it("refuse d'imbriquer un groupe dans un autre", () => {
    let r = creerGroupe(RANGEMENT_VIDE, 'g1', 'Un')
    r = creerGroupe(r, 'g2', 'Deux')
    expect(deplacer(r, { type: 'groupe', id: 'g2' }, { groupe: 'g1', index: 0 })).toBe(r)
  })

  it('rend leur place aux conversations quand le groupe est défait', () => {
    let r = materialiser(sessions('a', 'b', 'c'), RANGEMENT_VIDE)
    r = creerGroupe(r, 'g1', 'G', 1, ['c'])
    expect(affiche(assembler(sessions('a', 'b', 'c'), r))).toEqual(['a', '[G]', '  c', 'b'])
    r = dissoudreGroupe(r, 'g1')
    expect(affiche(assembler(sessions('a', 'b', 'c'), r))).toEqual(['a', 'c', 'b'])
  })

  it('renomme un groupe', () => {
    const r = renommerGroupe(creerGroupe(RANGEMENT_VIDE, 'g1', 'Sans nom'), 'g1', 'Attestation')
    expect(r.groupes.g1?.nom).toBe('Attestation')
  })

  it("omet sans broncher une conversation disparue du disque", () => {
    const r = creerGroupe(materialiser(sessions('a', 'b'), RANGEMENT_VIDE), 'g1', 'G', 0, ['b'])
    expect(affiche(assembler(sessions('a'), r))).toEqual(['[G]', 'a'])
  })

  it('oublie une conversation écartée', () => {
    const r = oublier(creerGroupe(RANGEMENT_VIDE, 'g1', 'G', 0, ['a', 'b']), 'a')
    expect(r.groupes.g1?.sessions).toEqual(['b'])
  })

  it('ne modifie jamais le rangement qu\'on lui donne', () => {
    const origine = materialiser(sessions('a', 'b'), RANGEMENT_VIDE)
    const copie = structuredClone(origine)
    deplacer(origine, { type: 'session', id: 'a' }, { groupe: null, index: 2 })
    creerGroupe(origine, 'g1', 'G', 0, ['a'])
    expect(origine).toEqual(copie)
  })
})
