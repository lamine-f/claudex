import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
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
