import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { listerSessions } from '../src/main/services/claude-projects'
import { claudeProjectPath } from '../src/main/util/paths'
import { mkdir } from 'node:fs/promises'

const ligne = (o: unknown): string => `${JSON.stringify(o)}\n`

describe('lecture des sessions Claude Code', () => {
  let projet = ''
  let dossierTranscrits = ''

  beforeAll(async () => {
    projet = await mkdtemp(join(tmpdir(), 'claudex-proj-'))
    dossierTranscrits = claudeProjectPath(projet)
    await mkdir(dossierTranscrits, { recursive: true })

    // Session complète, avec titre généré par Claude Code.
    await writeFile(
      join(dossierTranscrits, '11111111-1111-1111-1111-111111111111.jsonl'),
      ligne({ type: 'last-prompt', sessionId: 'x' }) +
        ligne({ type: 'user', message: { content: 'ceci ne doit pas servir de titre' } }) +
        ligne({ type: 'ai-title', aiTitle: 'Refonte facturation' }) +
        ligne({ type: 'assistant', gitBranch: 'main', timestamp: '2026-08-31T20:06:51.020Z' })
    )

    // Session sans ai-title : le premier message de l'utilisateur prend le relais.
    await writeFile(
      join(dossierTranscrits, '22222222-2222-2222-2222-222222222222.jsonl'),
      ligne({ type: 'user', message: { content: [{ text: 'corrige le bug de pagination' }] } })
    )

    // Transcript sans conversation : ne doit pas apparaître.
    await writeFile(
      join(dossierTranscrits, '33333333-3333-3333-3333-333333333333.jsonl'),
      ligne({ type: 'bridge-session', sessionId: 'y' })
    )

    // Un fichier volumineux dont le titre est en tête : la lecture doit s'arrêter
    // bien avant la fin, sinon le test durerait une éternité.
    const remplissage = ligne({ type: 'assistant', message: { content: 'x'.repeat(4000) } })
    await writeFile(
      join(dossierTranscrits, '44444444-4444-4444-4444-444444444444.jsonl'),
      ligne({ type: 'ai-title', aiTitle: 'Gros transcript' }) + remplissage.repeat(3000)
    )
  })

  afterAll(async () => {
    await rm(dossierTranscrits, { recursive: true, force: true })
    await rm(projet, { recursive: true, force: true })
  })

  it('rend les sessions du dossier, les plus récentes en tête', async () => {
    const sessions = await listerSessions(projet)
    const titres = sessions.map((s) => s.titre)
    expect(titres).toContain('Refonte facturation')
    expect(titres).toContain('Gros transcript')
  })

  it("prend l'ai-title quand il existe, et le note comme titre d'origine", async () => {
    const sessions = await listerSessions(projet)
    const cible = sessions.find((s) => s.id.startsWith('1111'))
    expect(cible?.titre).toBe('Refonte facturation')
    expect(cible?.titreDeRepli).toBe(false)
    expect(cible?.gitBranch).toBe('main')
  })

  it('se rabat sur le premier message quand le titre manque', async () => {
    const sessions = await listerSessions(projet)
    const cible = sessions.find((s) => s.id.startsWith('2222'))
    expect(cible?.titre).toBe('corrige le bug de pagination')
    expect(cible?.titreDeRepli).toBe(true)
  })

  it('écarte les transcrits sans conversation', async () => {
    const sessions = await listerSessions(projet)
    expect(sessions.some((s) => s.id.startsWith('3333'))).toBe(false)
  })

  it("lit un gros transcript sans le parcourir en entier", async () => {
    const depart = Date.now()
    const sessions = await listerSessions(projet)
    const gros = sessions.find((s) => s.id.startsWith('4444'))
    // Le fichier pèse plusieurs mégaoctets ; seuls ses premiers kilo-octets sont lus.
    expect(gros?.octets).toBeGreaterThan(1_000_000)
    expect(Date.now() - depart).toBeLessThan(2000)
  })

  it("rend une liste vide pour un dossier où claude n'a jamais tourné", async () => {
    expect(await listerSessions('/tmp/dossier-sans-claude-xyz')).toEqual([])
  })
})
