import { describe, expect, it } from 'vitest'
import { bornes, cheminDeLUrl, media, urlMedia } from '../src/shared/media'

describe('reconnaissance des médias', () => {
  it('reconnaît images, vidéos et sons', () => {
    expect(media('/p/photo.PNG')?.genre).toBe('image')
    expect(media('/p/film.mp4')?.mime).toBe('video/mp4')
    expect(media('/p/voix.mp3')?.genre).toBe('audio')
  })

  it('laisse le reste au traitement des fichiers ordinaires', () => {
    expect(media('/p/index.ts')).toBeUndefined()
    expect(media('/p/LISEZMOI')).toBeUndefined()
    // Un nom qui commence par un point n'a pas d'extension.
    expect(media('/p/.png')).toBeUndefined()
  })
})

describe('adresse d’un média', () => {
  it('traverse l’aller-retour, espaces et accents compris', () => {
    const chemin = '/Users/x/Ndeye Awa avec son IDE/été (1).png'
    expect(cheminDeLUrl(urlMedia(chemin))).toBe(chemin)
  })

  it('traverse aussi un chemin Windows', () => {
    const chemin = 'C:\\Users\\x\\Mes photos\\vue.jpg'
    expect(cheminDeLUrl(urlMedia(chemin))).toBe(chemin)
  })

  it('ne rend rien d’une adresse sans chemin', () => {
    expect(cheminDeLUrl('claudex-media://fichier/')).toBeUndefined()
  })
})

describe('demande partielle', () => {
  it('lit un intervalle fermé', () => {
    expect(bornes('bytes=100-199', 1000)).toEqual({ debut: 100, fin: 199 })
  })

  it('va jusqu’au bout quand la fin n’est pas dite', () => {
    expect(bornes('bytes=900-', 1000)).toEqual({ debut: 900, fin: 999 })
  })

  it('compte depuis la fin quand le début ne l’est pas', () => {
    expect(bornes('bytes=-500', 1000)).toEqual({ debut: 500, fin: 999 })
  })

  it('ramène une fin trop lointaine à la taille du fichier', () => {
    expect(bornes('bytes=0-5000', 1000)).toEqual({ debut: 0, fin: 999 })
  })

  it('refuse ce qu’elle ne sait pas satisfaire', () => {
    expect(bornes(null, 1000)).toBeNull()
    expect(bornes('bytes=', 1000)).toBeNull()
    expect(bornes('octets=0-10', 1000)).toBeNull()
    // Début au-delà de la fin du fichier, et intervalle à l'envers.
    expect(bornes('bytes=2000-', 1000)).toBeNull()
    expect(bornes('bytes=800-200', 1000)).toBeNull()
  })
})
