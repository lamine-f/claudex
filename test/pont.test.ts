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
      workspace: { list: () => {}, add: () => {}, remove: () => {}, update: () => {} },
      term: {
        list: () => {}, create: () => {}, open: () => {}, input: () => {},
        resize: () => {}, detach: () => {}, close: () => {}, rename: () => {}
      },
      fs: { lireDossier: () => {}, lireApercu: () => {}, observer: () => {}, cesserObservation: () => {} },
      // Le cas réellement rencontré : un preload d'avant l'ajout des étiquettes.
      claude: {
        listSessions: () => {},
        ouvrir: () => {},
        nommer: () => {},
        favori: () => {},
        ecarter: () => {},
        rangement: () => {},
        arranger: () => {}
      },
      git: { etat: () => {} },
      doctor: { check: () => {}, applySettingsFix: () => {} }
    }
    expect(manquesDuPont(pont)).toEqual(['claude.etiqueter'])
  })
})
