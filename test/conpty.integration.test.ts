import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { pilote } from '../src/main/services/multiplexeur/conpty'

/**
 * Le pendant de `tmux.integration.test.ts` pour le pilote Windows : il ouvre de
 * vrais pty ConPTY et lit ce qu'ils écrivent.
 *
 * Ces cas ne sont pas la copie des autres. Le pilote tmux est vérifié sur ce qui
 * fait tmux — la survie de la session, l'isolement du socket. Celui-ci l'est sur
 * ce qui le remplace : l'amorce jouée par un script, le tampon qui tient lieu
 * d'historique, et l'aveu qu'une session ne survit pas.
 */
const decrire = process.platform === 'win32' ? describe : describe.skip

async function attendre(condition: () => boolean, msMax = 15_000): Promise<void> {
  const limite = Date.now() + msMax
  while (!condition() && Date.now() < limite) {
    await new Promise((resoudre) => setTimeout(resoudre, 50))
  }
}

decrire('intégration ConPTY', () => {
  let dossier = ''
  let projet = ''
  const sessions: string[] = []

  /** Crée une session et rend ce que son pty écrit, accumulé. */
  const ouvrir = async (
    nom: string,
    amorce?: Parameters<typeof pilote.assurer>[4]
  ): Promise<{ lu: () => string }> => {
    sessions.push(nom)
    await pilote.assurer(nom, projet, 100, 30, amorce)
    const processus = pilote.attacher(nom, 100, 30)
    let recu = ''
    processus.onData((donnees) => {
      recu += donnees
    })
    return { lu: () => recu }
  }

  /**
   * La politique d'exécution héritée du shell qui lance les tests.
   *
   * Un terminal ouvert en `-ExecutionPolicy Bypass` pose
   * `PSExecutionPolicyPreference` dans son environnement, et tout ce qu'il lance
   * en hérite, de proche en proche. C'est ce qui a masqué un terminal incapable
   * de s'ouvrir sur une machine ordinaire : la suite passait ici, l'application
   * installée échouait sur « l'exécution de scripts est désactivée sur ce
   * système ». Les cas partent donc sans elle, comme partirait un poste neuf.
   */
  const politiqueHeritee = process.env.PSExecutionPolicyPreference

  beforeAll(async () => {
    delete process.env.PSExecutionPolicyPreference
    dossier = await mkdtemp(join(tmpdir(), 'claudex-conpty-'))
    projet = await mkdtemp(join(tmpdir(), 'claudex-projet-'))
    await pilote.preparerConfiguration(dossier)
  })

  afterAll(async () => {
    for (const nom of sessions) await pilote.detruire(nom)
    // Windows garde le dossier verrouillé tant que le processus qui l'a pour
    // répertoire courant n'a pas fini de mourir, et `kill` ne fait que le
    // demander. Les tentatives laissent au système le temps de lâcher prise.
    const effacer = { recursive: true, force: true, maxRetries: 20, retryDelay: 100 }
    await rm(dossier, effacer)
    await rm(projet, effacer)
    if (politiqueHeritee === undefined) delete process.env.PSExecutionPolicyPreference
    else process.env.PSExecutionPolicyPreference = politiqueHeritee
  })

  it("annonce qu'une session ne survit pas à l'application", () => {
    // C'est la différence qui compte face à tmux, et l'écran d'état la reprend :
    // elle est déclarée plutôt que laissée à découvrir.
    expect(pilote.persistant).toBe(false)
  })

  it("crée la session et signale qu'elle n'existait pas", async () => {
    const nom = `cdx_creation_${process.pid}`
    expect(await pilote.existe(nom)).toBe(false)
    expect((await pilote.assurer(nom, projet, 100, 30)).preexistante).toBe(false)
    sessions.push(nom)
    expect(await pilote.existe(nom)).toBe(true)
    expect((await pilote.assurer(nom, projet, 100, 30)).preexistante).toBe(true)
  })

  it('joue la commande au lancement, sans dépendre d’une frappe simulée', async () => {
    // Le shell affiche son invite avant d'être prêt à lire son entrée : une frappe
    // envoyée après coup serait avalée. Elle passe donc par le script d'amorce.
    const terminal = await ouvrir(`cdx_amorce_${process.pid}`, {
      commande: 'echo AMORCE_JOUEE'
    })
    await attendre(() => terminal.lu().includes('AMORCE_JOUEE'))
    expect(terminal.lu()).toContain('AMORCE_JOUEE')
  })

  it('rend la main à un shell interactif, la session survivant à la commande', async () => {
    const nom = `cdx_apres_${process.pid}`
    const terminal = await ouvrir(nom, { commande: 'echo AVANT_INVITE' })
    await attendre(() => terminal.lu().includes('AVANT_INVITE'))

    // Sans `-NoExit`, le shell sortirait à la fin du script et l'onglet se
    // refermerait sous les yeux de l'utilisateur.
    pilote.attacher(nom, 100, 30).write('echo ENCORE_LA\r')
    await attendre(() => terminal.lu().includes('ENCORE_LA'))
    expect(terminal.lu()).toContain('ENCORE_LA')
    expect(await pilote.existe(nom)).toBe(true)
  })

  it("réaffiche l'écran de la vie précédente, accents compris", async () => {
    // Ce que tmux fait en redessinant son historique, ici c'est un fichier relu
    // par .NET. `Get-Content` le décodait selon la page de codes de la console, et
    // les accents en ressortaient abîmés : le cas est là pour l'empêcher.
    const ecran = join(dossier, 'ecran-precedent.txt')
    await writeFile(ecran, 'RETOUR élégant — déjà vu\n', 'utf8')

    const terminal = await ouvrir(`cdx_ecran_${process.pid}`, { ecranPrecedent: ecran })
    await attendre(() => terminal.lu().includes('RETOUR'))
    expect(terminal.lu()).toContain('RETOUR élégant — déjà vu')
  })

  it('garde de quoi restituer un écran après la mort de la session', async () => {
    const nom = `cdx_capture_${process.pid}`
    const terminal = await ouvrir(nom, { commande: 'echo CAPTURE_OK' })
    await attendre(() => terminal.lu().includes('CAPTURE_OK'))

    // Personne ne tient l'historique à notre place : sans ce tampon, une session
    // recréée repartirait d'un écran vide.
    const capture = await pilote.capturer(nom, 200)
    expect(capture).toContain('CAPTURE_OK')

    // Et il ne doit plus porter d'ordre de dessin. Le shell commence par un
    // effacement d'écran ; le rejouer emportait tout ce qui venait d'être écrit
    // au-dessus, et l'écran restitué revenait vide.
    expect(capture).not.toContain('\u001b[2J')
    expect(capture).not.toMatch(/\u001b\[[0-9;?]*[A-Za-ln-z]/)
  })

  it('détruit la session, et ce qu’elle avait retenu avec elle', async () => {
    const nom = `cdx_fin_${process.pid}`
    await ouvrir(nom, { commande: 'echo A_DETRUIRE' })
    await pilote.detruire(nom)
    expect(await pilote.existe(nom)).toBe(false)
    expect(await pilote.capturer(nom)).toBe('')
  })

  it('protège une chaîne pour PowerShell, apostrophes comprises', () => {
    // Le nom d'une bifurcation vient de l'utilisateur et part dans un `--name`.
    expect(pilote.proteger("l'idée d'Ada")).toBe("'l''idée d''Ada'")
  })
})
