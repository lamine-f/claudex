import { execFile } from 'node:child_process'
import { mkdir, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { expect, test } from '@playwright/test'
import { fermer, lancer, type Contexte } from './fixtures'

const run = promisify(execFile)

/**
 * Commande avec laquelle chaque session tmux a été lancée.
 *
 * L'amorce fait partie de la création de la session — elle n'est pas tapée dans le
 * terminal — c'est donc tmux, et non l'écran, qui en porte la trace.
 */
async function commandesDeDepart(): Promise<string[]> {
  try {
    const { stdout } = await run('tmux', [
      '-L',
      'claudex',
      'list-panes',
      '-a',
      '-F',
      '#{pane_start_command}'
    ])
    return stdout.split('\n').filter(Boolean)
  } catch {
    return []
  }
}

const ligne = (o: unknown): string => `${JSON.stringify(o)}\n`

/** Dossier de transcrits que Claude Code utiliserait pour ce projet. */
function dossierTranscrits(projet: string): string {
  return join(process.env.HOME!, '.claude', 'projects', projet.replace(/[^a-zA-Z0-9-]/g, '-'))
}

/** Reproduit l'arborescence de transcrits de Claude Code pour un projet donné. */
async function semerTranscrits(projet: string): Promise<void> {
  const dossier = dossierTranscrits(projet)
  await mkdir(dossier, { recursive: true })

  await writeFile(
    join(dossier, 'aaaaaaaa-1111-1111-1111-111111111111.jsonl'),
    ligne({ type: 'ai-title', aiTitle: 'Refonte facturation' }) +
      ligne({ type: 'assistant', gitBranch: 'main', timestamp: '2026-08-31T20:06:51.020Z' })
  )
  await writeFile(
    join(dossier, 'bbbbbbbb-2222-2222-2222-222222222222.jsonl'),
    ligne({ type: 'ai-title', aiTitle: 'Migration DTO' })
  )
  // Sans conversation : ne doit jamais apparaître dans la colonne.
  await writeFile(
    join(dossier, 'cccccccc-3333-3333-3333-333333333333.jsonl'),
    ligne({ type: 'bridge-session' })
  )
}

test.describe('sessions Claude Code dans la colonne de gauche', () => {
  let ctx: Contexte

  test.beforeAll(async () => {
    const provisoire = await lancer()
    await semerTranscrits(provisoire.projet)
    await fermer(provisoire, { nettoyer: false })
    ctx = await lancer({ donnees: provisoire.donnees, projet: provisoire.projet })
  })

  test.afterAll(async () => {
    // Les transcrits factices vivent dans le vrai ~/.claude/projects : ne rien y
    // laisser derrière soi.
    await rm(dossierTranscrits(ctx.projet), { recursive: true, force: true })
    await fermer(ctx)
  })

  const colonne = (): ReturnType<Contexte['page']['getByLabel']> =>
    ctx.page.getByLabel('Workspaces')

  test('les conversations du dossier apparaissent avec leur titre', async () => {
    await expect(colonne().getByText('Refonte facturation')).toBeVisible()
    await expect(colonne().getByText('Migration DTO')).toBeVisible()
  })

  test('les transcrits sans conversation sont écartés', async () => {
    await expect(ctx.page.getByText('cccccccc')).toHaveCount(0)
  })

  test('un clic reprend la conversation dans un nouvel onglet', async () => {
    await colonne().getByText('Refonte facturation').click()
    await expect(ctx.page.locator('.xterm')).toHaveCount(1)

    // L'onglet porte l'identifiant de la conversation : c'est ce lien, que Claude
    // Code ne mémorise pas, qui permettra de la retrouver après un redémarrage.
    const onglets = await ctx.page.evaluate(() => window.claudex.term.list('ws1'))
    expect(onglets[0]?.claudeSessionId).toBe('aaaaaaaa-1111-1111-1111-111111111111')

    // Et la session tmux a bien été lancée sur la commande de reprise.
    await expect
      .poll(async () => (await commandesDeDepart()).join('\n'))
      .toContain('claude -r aaaaaaaa-1111-1111-1111-111111111111')
  })

  test('rouvrir la même conversation bascule sur son onglet au lieu de le dédoubler', async () => {
    await colonne().getByText('Refonte facturation').click()
    await expect(ctx.page.locator('.xterm')).toHaveCount(1)
  })

  test("l'onglet porte le titre de la conversation, pas un libellé générique", async () => {
    // Avec plusieurs agents ouverts, « Agent » partout ne permet pas de s'y
    // retrouver : c'est le titre de la conversation qui sert de repère.
    await expect(ctx.page.getByRole('button', { name: 'Refonte facturation' }).last()).toBeVisible()
  })

  test('une bifurcation ouvre un second onglet sans toucher à l’original', async () => {
    await colonne().getByText('Refonte facturation').hover()
    await ctx.page.getByTitle(/Bifurquer/).first().click()
    await expect(ctx.page.locator('.xterm')).toHaveCount(2)

    await expect.poll(async () => (await commandesDeDepart()).join('\n')).toContain('--fork-session')
  })
})
