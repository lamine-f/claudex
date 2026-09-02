import { execFile } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { promisify } from 'node:util'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  capturePane,
  commandeComplete,
  preparerConfiguration,
  ensureSession,
  hasSession,
  killSession,
  paneInfo,
  sendKeys
} from '../src/main/services/tmux'

const run = promisify(execFile)

/**
 * Test d'intégration : il pilote un vrai serveur tmux, sur le socket dédié de
 * Claudex. Le socket par défaut de l'utilisateur n'est jamais touché — c'est
 * précisément ce que le dernier cas vérifie.
 */
describe('intégration tmux', () => {
  const session = `cdx_test_${process.pid}`
  let dossier = ''

  beforeAll(async () => {
    await preparerConfiguration(join(tmpdir(), 'claudex-conf'))
    dossier = await mkdtemp(join(tmpdir(), 'claudex-test-'))
  })

  afterAll(async () => {
    await killSession(session)
    await rm(dossier, { recursive: true, force: true })
  })

  it("crée la session et signale qu'elle n'existait pas", async () => {
    expect(await hasSession(session)).toBe(false)
    const premier = await ensureSession(session, dossier, 100, 30)
    expect(premier.preexistante).toBe(false)
    expect(await hasSession(session)).toBe(true)
  })

  it('signale une session déjà présente au lieu de la recréer', async () => {
    const second = await ensureSession(session, dossier, 100, 30)
    expect(second.preexistante).toBe(true)
  })

  it('rapporte le répertoire de travail du pane', async () => {
    const info = await paneInfo(session)
    // macOS expose /var/folders via le lien /private : on compare les suffixes.
    expect(info?.cwd.endsWith(dossier.replace('/private', ''))).toBe(true)
    expect(info?.tty).toMatch(/tty/)
  })

  it("capture le contenu du pane, y compris ce qu'on y écrit", async () => {
    await sendKeys(session, 'echo CLAUDEX_CAPTURE_OK', 'Enter')
    // La capture peut précéder l'affichage : on réessaie brièvement.
    let contenu = ''
    for (let essai = 0; essai < 40 && !contenu.includes('CLAUDEX_CAPTURE_OK'); essai++) {
      contenu = await capturePane(session, 200)
      if (!contenu.includes('CLAUDEX_CAPTURE_OK')) {
        await new Promise((resoudre) => setTimeout(resoudre, 50))
      }
    }
    expect(contenu).toContain('CLAUDEX_CAPTURE_OK')
  })

  it('retrouve la ligne de commande complète du processus au premier plan', async () => {
    await sendKeys(session, 'sleep 37', 'Enter')
    let commande: string | null = null
    for (let essai = 0; essai < 40 && !commande?.includes('sleep 37'); essai++) {
      const info = await paneInfo(session)
      commande = info ? await commandeComplete(info.tty) : null
      if (!commande?.includes('sleep 37')) {
        await new Promise((resoudre) => setTimeout(resoudre, 50))
      }
    }
    expect(commande).toContain('sleep 37')
  })

  it('reste invisible depuis le socket tmux par défaut', async () => {
    let sortie = ''
    try {
      const { stdout } = await run('tmux', ['ls'])
      sortie = stdout
    } catch {
      // Aucun serveur tmux par défaut : l'isolation est acquise.
    }
    expect(sortie).not.toContain(session)
  })

  it('détruit la session à la fermeture', async () => {
    await killSession(session)
    expect(await hasSession(session)).toBe(false)
  })
})

describe('création concurrente', () => {
  const session = `cdx_race_${process.pid}`

  afterAll(async () => {
    await killSession(session)
  })

  it("ne casse pas quand deux ouvertures créent la même session en même temps", async () => {
    await preparerConfiguration(join(tmpdir(), 'claudex-conf'))
    // Le cas se produit à chaque remontage React ou rechargement de la page.
    const resultats = await Promise.all([
      ensureSession(session, '/tmp', 100, 30),
      ensureSession(session, '/tmp', 100, 30),
      ensureSession(session, '/tmp', 100, 30)
    ])
    // Aucune n'échoue, et la session existe bien une fois les trois terminées.
    expect(resultats).toHaveLength(3)
    expect(await hasSession(session)).toBe(true)
  })
})

describe("commande d'amorçage", () => {
  const session = `cdx_amorce_${process.pid}`

  afterAll(async () => {
    await killSession(session)
  })

  it("joue la commande au lancement, sans dépendre d'une frappe simulée", async () => {
    await preparerConfiguration(join(tmpdir(), 'claudex-conf'))
    // Une frappe envoyée après coup serait avalée par un shell encore en train de
    // démarrer ; la faire porter par la création de session supprime la course.
    await ensureSession(session, '/tmp', 100, 30, 'echo AMORCE_JOUEE')

    let contenu = ''
    for (let essai = 0; essai < 60 && !contenu.includes('AMORCE_JOUEE'); essai++) {
      contenu = await capturePane(session, 200)
      if (!contenu.includes('AMORCE_JOUEE')) {
        await new Promise((resoudre) => setTimeout(resoudre, 50))
      }
    }
    expect(contenu).toContain('AMORCE_JOUEE')
  })

  it('rend la main à un shell interactif, la session survivant à la commande', async () => {
    // Sans `exec $SHELL`, la session mourrait dès la fin de la commande et
    // l'onglet se refermerait sous les yeux de l'utilisateur.
    expect(await hasSession(session)).toBe(true)
    const info = await paneInfo(session)
    expect(info?.commande).toMatch(/sh|zsh|bash|fish/)
  })
})

describe('configuration du serveur', () => {
  const session = `cdx_conf_${process.pid}`

  afterAll(async () => {
    await killSession(session)
  })

  it("désactive la barre de statut, même sur un serveur déjà démarré", async () => {
    await preparerConfiguration(join(tmpdir(), 'claudex-conf'))
    // Le cas qui compte : un serveur tmux lancé plus tôt, dont les options ne
    // viennent pas de notre configuration. `-f` seul ne suffirait pas.
    await run('tmux', ['-L', 'claudex', 'set-option', '-g', 'status', 'on']).catch(() => undefined)
    await ensureSession(session, '/tmp', 100, 30)

    const { stdout } = await run('tmux', ['-L', 'claudex', 'show-options', '-g', 'status'])
    expect(stdout.trim()).toBe('status off')
  })
})
