import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Destinataire } from '../src/main/services/pty'
import * as pty from '../src/main/services/pty'
import {
  ensureSession,
  hasSession,
  killSession,
  preparerConfiguration
} from '../src/main/services/tmux'

/** Destinataire de test : accumule ce que le pty envoie au renderer. */
function faireDestinataire(): Destinataire & { recu: string; sorties: number[] } {
  return {
    recu: '',
    sorties: [],
    send(canal, ...args) {
      if (canal === 'term:data') this.recu += String(args[1])
      if (canal === 'term:exit') this.sorties.push(Number(args[1]))
    },
    isDestroyed: () => false
  }
}

async function attendre(condition: () => boolean, msMax = 5000): Promise<void> {
  const limite = Date.now() + msMax
  while (!condition() && Date.now() < limite) {
    await new Promise((resoudre) => setTimeout(resoudre, 50))
  }
}

describe('intégration pty ↔ tmux', () => {
  const session = `cdx_pty_${process.pid}`
  const tabId = 'tab-test'
  let dossier = ''

  beforeAll(async () => {
    await preparerConfiguration(join(tmpdir(), 'claudex-conf'))
    dossier = await mkdtemp(join(tmpdir(), 'claudex-pty-'))
    await ensureSession(session, dossier, 100, 30)
  })

  afterAll(async () => {
    pty.detach(tabId)
    await killSession(session)
    await rm(dossier, { recursive: true, force: true })
  })

  it("transmet la frappe au terminal et en rapporte la sortie", async () => {
    const destinataire = faireDestinataire()
    pty.attach(tabId, session, 100, 30, destinataire)
    expect(pty.estAttache(tabId)).toBe(true)

    await attendre(() => destinataire.recu.length > 0)
    pty.write(tabId, 'echo CLAUDEX_PTY_ALLER_RETOUR\n')
    await attendre(() => destinataire.recu.includes('CLAUDEX_PTY_ALLER_RETOUR'))

    expect(destinataire.recu).toContain('CLAUDEX_PTY_ALLER_RETOUR')
  })

  it('accepte un redimensionnement sans rompre la liaison', () => {
    pty.resize(tabId, 120, 40)
    expect(pty.estAttache(tabId)).toBe(true)
  })

  it('détache sans détruire la session tmux', async () => {
    pty.detach(tabId)
    expect(pty.estAttache(tabId)).toBe(false)
    // C'est tout l'intérêt de tmux : fermer l'app ne tue rien.
    expect(await hasSession(session)).toBe(true)
  })

  it('retrouve la session et son contenu au réattachement', async () => {
    const destinataire = faireDestinataire()
    pty.attach(tabId, session, 100, 30, destinataire)
    await attendre(() => destinataire.recu.includes('CLAUDEX_PTY_ALLER_RETOUR'))
    // tmux redessine l'écran au client qui se rattache : ce qui avait été écrit
    // avant le détachement est toujours là.
    expect(destinataire.recu).toContain('CLAUDEX_PTY_ALLER_RETOUR')
  })
})

describe('un seul client par session', () => {
  const session = `cdx_solo_${process.pid}`
  const tabA = 'tab-a'
  const tabB = 'tab-b'

  beforeAll(async () => {
    await preparerConfiguration(join(tmpdir(), 'claudex-conf'))
    await ensureSession(session, tmpdir(), 100, 30)
  })

  afterAll(async () => {
    pty.detach(tabA)
    pty.detach(tabB)
    await killSession(session)
  })

  it("n'affiche pas les caractères en double quand un second client s'attache", async () => {
    const premier = faireDestinataire()
    pty.attach(tabA, session, 100, 30, premier)
    await attendre(() => premier.recu.length > 0)

    // Deuxième client sur la même session : sans `-d`, les deux recevraient
    // l'écho et chaque frappe s'afficherait deux fois.
    const second = faireDestinataire()
    pty.attach(tabB, session, 100, 30, second)
    await attendre(() => second.recu.length > 0)

    second.recu = ''
    pty.write(tabB, 'echo SANS_DOUBLON\n')
    await attendre(() => second.recu.includes('SANS_DOUBLON'))
    await new Promise((r) => setTimeout(r, 600))

    const occurrences = second.recu.split('SANS_DOUBLON').length - 1
    // Une fois pour l'écho de la frappe, une fois pour la sortie de la commande.
    expect(occurrences).toBeLessThanOrEqual(2)
  })

  it('laisse la sortie au seul client encore attaché', async () => {
    // Le premier client a été évincé : il ne doit plus rien recevoir.
    const premier = faireDestinataire()
    pty.attach(tabA, session, 100, 30, premier)
    await attendre(() => premier.recu.length > 0)
    expect(premier.recu.length).toBeGreaterThan(0)
  })
})

describe('registre des attachements', () => {
  const session = `cdx_reg_${process.pid}`
  const tabId = 'tab-registre'

  beforeAll(async () => {
    await preparerConfiguration(join(tmpdir(), 'claudex-conf'))
    await ensureSession(session, tmpdir(), 100, 30)
  })

  afterAll(async () => {
    pty.detach(tabId)
    await killSession(session)
  })

  it("reste écrivable après un réattachement", async () => {
    const premier = faireDestinataire()
    pty.attach(tabId, session, 100, 30, premier)
    await attendre(() => premier.recu.length > 0)

    // Le rattachement tue le pty précédent. Sa sortie survient après
    // l'enregistrement du nouveau : si elle vidait le registre, l'onglet
    // continuerait d'afficher mais n'accepterait plus une seule frappe.
    const second = faireDestinataire()
    pty.attach(tabId, session, 100, 30, second)
    await attendre(() => second.recu.length > 0)

    // Laisser la sortie de l'ancien processus se produire.
    await new Promise((r) => setTimeout(r, 800))
    expect(pty.estAttache(tabId)).toBe(true)

    second.recu = ''
    pty.write(tabId, 'echo ENCORE_ECRIVABLE\n')
    await attendre(() => second.recu.includes('ENCORE_ECRIVABLE'), 8000)
    expect(second.recu).toContain('ENCORE_ECRIVABLE')
  })
})
