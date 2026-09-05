import { describe, expect, it } from 'vitest'
import { manquesDuPont } from '../src/shared/pont'

/** Le contrôle doit voir un pont incomplet, sinon il ne sert à rien. */
describe('contrôle du pont', () => {
  it('signale un pont absent', () => {
    expect(manquesDuPont(undefined)).toEqual(['claudex'])
  })

  it('nomme précisément la méthode qui manque', () => {
    const pont = {
      state: { get: () => {}, setLayout: () => {}, setActiveWorkspace: () => {} },
      workspace: { list: () => {}, add: () => {}, remove: () => {}, update: () => {}, ranger: () => {} },
      term: {
        list: () => {}, comptes: () => {}, create: () => {}, open: () => {}, focus: () => {},
        input: () => {},
        resize: () => {}, detach: () => {}, close: () => {}, rename: () => {}
      },
      fs: {
        lireDossier: () => {}, lireApercu: () => {}, montrer: () => {},
        observer: () => {}, cesserObservation: () => {}
      },
      // Le cas réellement rencontré : un preload d'avant l'ajout des étiquettes.
      claude: {
        listSessions: () => {},
        ouvrir: () => {},
        nommer: () => {},
        favori: () => {},
        ecarter: () => {},
        rangement: () => {},
        arranger: () => {},
        apaiser: () => {}
      },
      git: { etat: () => {} },
      systeme: { plateforme: () => {} },
      doctor: { check: () => {}, appliquer: () => {} }
    }
    expect(manquesDuPont(pont)).toEqual(['claude.etiqueter'])
  })
})
