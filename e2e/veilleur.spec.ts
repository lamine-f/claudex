import { mkdir, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { expect, test } from '@playwright/test'
import { fermer, lancer, NOUVEAU_TERMINAL } from './fixtures'

test('une conversation lancée à la main est rattachée à son onglet', async () => {
  const ctx = await lancer()
  try {
    // Le projet est ouvert : Claudex guette dès lors les conversations qui y naissent.
    await expect(ctx.page.getByText('aucune session ici')).toBeVisible()
    await ctx.page.getByTitle(NOUVEAU_TERMINAL).click()
    await expect(ctx.page.locator('.xterm')).toHaveCount(1)

    // Un `claude` tapé à la main écrirait exactement ce transcript.
    const dossier = join(
      homedir(),
      '.claude',
      'projects',
      ctx.projet.replace(/[^a-zA-Z0-9-]/g, '-')
    )
    await mkdir(dossier, { recursive: true })
    const uuid = 'eeeeeeee-5555-5555-5555-555555555555'
    await writeFile(
      join(dossier, `${uuid}.jsonl`),
      `${JSON.stringify({ type: 'ai-title', aiTitle: 'Lancée à la main' })}\n`
    )

    // Elle apparaît dans la colonne sans intervention.
    await expect(ctx.page.getByLabel('Sessions et fichiers').getByText('Lancée à la main')).toBeVisible({
      timeout: 15_000
    })

    // Et l'onglet ouvert la porte désormais : c'est ce lien qui la rendra
    // reprenable au prochain démarrage.
    await expect
      .poll(async () => {
        const onglets = await ctx.page.evaluate(() => window.claudex.term.list('ws1'))
        return onglets[0]?.claudeSessionId
      })
      .toBe(uuid)
  } finally {
    const { rm } = await import('node:fs/promises')
    await rm(
      join(homedir(), '.claude', 'projects', ctx.projet.replace(/[^a-zA-Z0-9-]/g, '-')),
      { recursive: true, force: true }
    )
    await fermer(ctx)
  }
})
