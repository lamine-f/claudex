import { describe, expect, it } from 'vitest'
import {
  cleDe,
  deplacer,
  echapper,
  encadrer,
  estVide,
  migrer,
  orphelines,
  pourEnvoi
} from '../src/shared/taches'
import type { Tache } from '../src/shared/types'

const consigne = (id: string, texte = 'faire', images?: string[]): Tache => ({
  id,
  texte,
  creeeLe: 0,
  ...(images ? { images } : {})
})

/** Les marques de collage, telles qu'un terminal les envoie. */
const DEBUT = '\u001b[200~'
const FIN = '\u001b[201~'

describe('la clé d’une file', () => {
  it('suit la conversation quand elle en a une', () => {
    expect(cleDe({ id: 'onglet-1', claudeSessionId: 'uuid-9' })).toBe('uuid-9')
  })

  it('retombe sur l’onglet tant que Claude Code ne s’est pas nommé', () => {
    // Un onglet neuf n'a pas encore d'uuid : sans cela, on ne pourrait rien y
    // préparer avant que l'agent ne démarre.
    expect(cleDe({ id: 'onglet-1' })).toBe('onglet-1')
  })
})

describe('migration d’une file vers la conversation', () => {
  it('déplace ce qui était rangé sous l’onglet', () => {
    const avant = { 'onglet-1': [consigne('a')], autre: [consigne('b')] }
    expect(migrer(avant, 'onglet-1', 'uuid-9')).toEqual({
      autre: [consigne('b')],
      'uuid-9': [consigne('a')]
    })
  })

  it('ajoute à la suite quand la conversation a déjà une file', () => {
    // Le cas d'une conversation reprise dans un second onglet où l'on avait
    // commencé à écrire.
    const avant = { 'onglet-1': [consigne('b')], 'uuid-9': [consigne('a')] }
    expect(migrer(avant, 'onglet-1', 'uuid-9')['uuid-9']).toEqual([consigne('a'), consigne('b')])
  })

  it('ne touche à rien quand l’onglet n’avait rien préparé', () => {
    const avant = { 'uuid-9': [consigne('a')] }
    expect(migrer(avant, 'onglet-1', 'uuid-9')).toBe(avant)
  })
})

describe('rangement dans la file', () => {
  const file = [consigne('a'), consigne('b'), consigne('c')]

  it('remonte une consigne', () => {
    expect(deplacer(file, 'c', 0).map((t) => t.id)).toEqual(['c', 'a', 'b'])
  })

  it('descend une consigne', () => {
    expect(deplacer(file, 'a', 2).map((t) => t.id)).toEqual(['b', 'c', 'a'])
  })

  it('borne la place demandée', () => {
    expect(deplacer(file, 'a', 9).map((t) => t.id)).toEqual(['b', 'c', 'a'])
  })

  it('rend la liste telle quelle quand rien ne bouge', () => {
    expect(deplacer(file, 'b', 1)).toBe(file)
    expect(deplacer(file, 'inconnue', 0)).toBe(file)
  })
})

describe('le texte envoyé à l’agent', () => {
  it('joint les images par leur chemin, sur une ligne à part', () => {
    expect(pourEnvoi(consigne('a', 'Regarde ceci', ['/tmp/a.png']))).toBe(
      'Regarde ceci\n\n/tmp/a.png'
    )
  })

  it('échappe les espaces d’un chemin, comme le fait un glisser-déposer', () => {
    expect(echapper('/Users/x/Mon Projet/a (1).png')).toBe('/Users/x/Mon\\ Projet/a\\ \\(1\\).png')
  })

  it('n’ajoute pas de ligne vide quand il n’y a pas d’image', () => {
    expect(pourEnvoi(consigne('a', '  Reprends la pagination  '))).toBe('Reprends la pagination')
  })

  it('accepte une consigne qui n’est qu’une image', () => {
    expect(pourEnvoi(consigne('a', '', ['/tmp/a.png']))).toBe('/tmp/a.png')
  })
})

describe('consigne vide', () => {
  it('refuse un texte blanc sans image', () => {
    expect(estVide({ texte: '   \n ' })).toBe(true)
  })

  it('accepte une image sans texte', () => {
    expect(estVide({ texte: '', images: ['/tmp/a.png'] })).toBe(false)
  })
})

describe('collage encadré', () => {
  it('entoure le texte des marques de collage', () => {
    expect(encadrer('deux\nlignes')).toBe(`${DEBUT}deux\nlignes${FIN}`)
  })

  it('retire une marque de fin trouvée dans le texte', () => {
    // Elle refermerait le collage en son milieu, et la suite serait prise pour
    // des touches tapées une à une.
    expect(encadrer(`a${FIN}b`)).toBe(`${DEBUT}ab${FIN}`)
  })
})

describe('images qu’aucune consigne ne réclame', () => {
  it('garde celles qui sont encore jointes', () => {
    const taches = { 'uuid-9': [consigne('a', 'x', ['/i/tenue.png'])] }
    expect(orphelines(taches, ['/i/tenue.png', '/i/partie.png'])).toEqual(['/i/partie.png'])
  })

  it('rend tout quand plus aucune file n’existe', () => {
    expect(orphelines({}, ['/i/a.png'])).toEqual(['/i/a.png'])
  })
})
