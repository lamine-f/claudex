import { describe, expect, it } from 'vitest'
import { nomSession } from '../src/main/services/projets-services'

/**
 * Le nom de session d'un service, que tmux doit accepter et qui doit rester
 * propre à celui dont il vient.
 */
describe('nom de session d’un service', () => {
  it('laisse intact un nom déjà propre', () => {
    // Les sessions ouvertes avant ce jour doivent se retrouver.
    expect(nomSession('ws1', 'olivecore')).toBe('svc_ws1_olivecore')
  })

  it('sépare deux noms que la réduction confondrait', () => {
    // « front public » et « frontpublic » donnaient le même nom : démarrer l'un
    // pilotait l'autre, et l'état de l'un se lisait pour l'autre.
    expect(nomSession('ws1', 'front public')).not.toBe(nomSession('ws1', 'frontpublic'))
  })

  it('sépare un nom accentué de sa version sans accent', () => {
    expect(nomSession('ws1', 'café')).not.toBe(nomSession('ws1', 'caf'))
  })

  it('ne garde que ce que tmux accepte', () => {
    // `.` et `:` sont des séparateurs de cible : les laisser passer ferait
    // désigner autre chose que la session voulue.
    expect(nomSession('ws1', 'front.public:2')).toMatch(/^[a-zA-Z0-9_]+$/)
  })

  it('rend toujours le même nom pour le même service', () => {
    // Sans quoi une session lancée ne se retrouverait pas au relevé suivant.
    expect(nomSession('ws1', 'front public')).toBe(nomSession('ws1', 'front public'))
  })

  it('sépare deux projets qui nomment leurs services pareil', () => {
    expect(nomSession('ws1', 'front')).not.toBe(nomSession('ws2', 'front'))
  })
})
