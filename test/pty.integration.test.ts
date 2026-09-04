import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { multiplexeur } from '../src/main/services/multiplexeur'
import type { Destinataire } from '../src/main/services/pty'
import * as pty from '../src/main/services/pty'
import { capturePane } from '../src/main/services/multiplexeur/tmux'

/**
 * Ce fichier éprouve le registre des attachements, qui est commun aux
 * plateformes : il parle au multiplexeur du système sans savoir lequel c'est.
 *
 * Deux cas font exception et restent réservés à tmux. Ils portent sur ce qu'une
 * session persistante permet — retrouver son écran au réattachement, n'accepter
 * qu'un client à la fois — et n'ont pas d'objet là où le pty est la session.
 */
const SUR_MAC_OU_LINUX = process.platform !== 'win32'
const decrireTmux = SUR_MAC_OU_LINUX ? describe : describe.skip

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

async function attendre(condition: () => boolean, msMax = 15_000): Promise<void> {
  const limite = Date.now() + msMax
  while (!condition() && Date.now() < limite) {
    await new Promise((resoudre) => setTimeout(resoudre, 50))
  }
}

/** Une commande qui dit la même chose à `sh` et à PowerShell. */
const echo = (mot: string): string => `echo ${mot}\r`

describe('intégration pty ↔ multiplexeur', () => {
  const session = `cdx_pty_${process.pid}`
  const tabId = 'tab-test'
  let dossier = ''

  beforeAll(async () => {
    await multiplexeur.preparerConfiguration(join(tmpdir(), 'claudex-conf'))
    dossier = await mkdtemp(join(tmpdir(), 'claudex-pty-'))
    await multiplexeur.assurer(session, dossier, 100, 30)
  })

  afterAll(async () => {
    pty.detach(tabId)
    await multiplexeur.detruire(session)
    // Windows garde le dossier verrouillé tant que le processus qui l'a pour
    // répertoire courant n'a pas fini de mourir : on lui laisse le temps.
    await rm(dossier, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 })
  })

  it('transmet la frappe au terminal et en rapporte la sortie', async () => {
    const destinataire = faireDestinataire()
    pty.attach(tabId, session, 100, 30, destinataire)
    expect(pty.estAttache(tabId)).toBe(true)

    await attendre(() => destinataire.recu.length > 0)
    pty.write(tabId, echo('CLAUDEX_PTY_ALLER_RETOUR'))
    await attendre(() => destinataire.recu.includes('CLAUDEX_PTY_ALLER_RETOUR'))

    expect(destinataire.recu).toContain('CLAUDEX_PTY_ALLER_RETOUR')
  })

  it('accepte un redimensionnement sans rompre la liaison', () => {
    pty.resize(tabId, 120, 40)
    expect(pty.estAttache(tabId)).toBe(true)
  })

  it('détache sans détruire la session', async () => {
    pty.detach(tabId)
    expect(pty.estAttache(tabId)).toBe(false)
    // Le détachement ne touche jamais la session : avec tmux elle survit à
    // l'application, avec ConPTY elle vit encore le temps de celle-ci.
    expect(await multiplexeur.existe(session)).toBe(true)
  })

  it('se réattache à la même session', async () => {
    const destinataire = faireDestinataire()
    pty.attach(tabId, session, 100, 30, destinataire)
    expect(pty.estAttache(tabId)).toBe(true)
    pty.write(tabId, echo('APRES_REATTACHEMENT'))
    await attendre(() => destinataire.recu.includes('APRES_REATTACHEMENT'))
    expect(destinataire.recu).toContain('APRES_REATTACHEMENT')
  })
})

decrireTmux('réaffichage au réattachement', () => {
  const session = `cdx_redessin_${process.pid}`
  const tabId = 'tab-redessin'

  beforeAll(async () => {
    await multiplexeur.preparerConfiguration(join(tmpdir(), 'claudex-conf'))
    await multiplexeur.assurer(session, tmpdir(), 100, 30)
  })

  afterAll(async () => {
    pty.detach(tabId)
    await multiplexeur.detruire(session)
  })

  it("retrouve le contenu d'avant le détachement", async () => {
    const premier = faireDestinataire()
    pty.attach(tabId, session, 100, 30, premier)
    await attendre(() => premier.recu.length > 0)
    pty.write(tabId, echo('AVANT_DETACHEMENT'))
    await attendre(() => premier.recu.includes('AVANT_DETACHEMENT'))
    pty.detach(tabId)

    // tmux redessine l'écran au client qui se rattache : ce qui avait été écrit
    // avant le détachement revient de lui-même. ConPTY n'a personne pour le faire,
    // et c'est le fichier d'écran qui prend le relais au lancement suivant.
    const second = faireDestinataire()
    pty.attach(tabId, session, 100, 30, second)
    await attendre(() => second.recu.includes('AVANT_DETACHEMENT'))
    expect(second.recu).toContain('AVANT_DETACHEMENT')
  })
})

decrireTmux('un seul client par session', () => {
  const session = `cdx_solo_${process.pid}`
  const tabA = 'tab-a'
  const tabB = 'tab-b'

  beforeAll(async () => {
    await multiplexeur.preparerConfiguration(join(tmpdir(), 'claudex-conf'))
    await multiplexeur.assurer(session, tmpdir(), 100, 30)
  })

  afterAll(async () => {
    pty.detach(tabA)
    pty.detach(tabB)
    await multiplexeur.detruire(session)
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
    pty.write(tabB, echo('SANS_DOUBLON'))
    await attendre(() => second.recu.includes('SANS_DOUBLON'))
    await new Promise((r) => setTimeout(r, 600))

    // C'est l'écran qui fait foi, pas le flux : tmux retransmet légitimement le
    // même contenu à chaque redessin. Le défaut cherché est un caractère tapé
    // deux fois — « eecchhoo » —, ce que seul l'écran révèle.
    const ecran = await capturePane(session, 200)
    expect(ecran).toContain('SANS_DOUBLON')
    expect(ecran).not.toContain('SSAANNSS')
    expect(ecran).not.toContain('eecchhoo')
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
    await multiplexeur.preparerConfiguration(join(tmpdir(), 'claudex-conf'))
    await multiplexeur.assurer(session, tmpdir(), 100, 30)
  })

  afterAll(async () => {
    pty.detach(tabId)
    await multiplexeur.detruire(session)
  })

  it('reste écrivable après un réattachement', async () => {
    const premier = faireDestinataire()
    pty.attach(tabId, session, 100, 30, premier)
    await attendre(() => premier.recu.length > 0)

    // Avec tmux, le rattachement tue le pty précédent et sa sortie survient après
    // l'enregistrement du nouveau : si elle vidait le registre, l'onglet
    // continuerait d'afficher mais n'accepterait plus une seule frappe.
    const second = faireDestinataire()
    pty.attach(tabId, session, 100, 30, second)
    await attendre(() => second.recu.length > 0)

    // Laisser la sortie de l'ancien processus se produire.
    await new Promise((r) => setTimeout(r, 800))
    expect(pty.estAttache(tabId)).toBe(true)

    second.recu = ''
    pty.write(tabId, echo('ENCORE_ECRIVABLE'))
    await attendre(() => second.recu.includes('ENCORE_ECRIVABLE'))
    expect(second.recu).toContain('ENCORE_ECRIVABLE')
  })

  it("ne livre plus rien au destinataire d'avant le réattachement", async () => {
    // Le pilote ConPTY rend le même pty d'un attachement à l'autre : sans
    // libération des écouteurs, l'ancien destinataire recevrait encore la sortie
    // et le terminal s'afficherait en double, puis en triple.
    const ancien = faireDestinataire()
    pty.attach(tabId, session, 100, 30, ancien)
    await attendre(() => ancien.recu.length > 0)

    const nouveau = faireDestinataire()
    pty.attach(tabId, session, 100, 30, nouveau)
    ancien.recu = ''

    pty.write(tabId, echo('POUR_LE_NOUVEAU'))
    await attendre(() => nouveau.recu.includes('POUR_LE_NOUVEAU'))
    expect(ancien.recu).toBe('')
  })
})
