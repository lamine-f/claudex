import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { parse } from 'yaml'
import { resoudre, type Declaration } from '../src/shared/services'
import { ecrireModele } from '../src/main/services/projets-services'

describe('modèle de déclaration', () => {
  let racine: string

  beforeAll(async () => {
    racine = await mkdtemp(join(tmpdir(), 'claudex-modele-'))
  })

  afterAll(async () => {
    await rm(racine, { recursive: true, force: true })
  })

  it('écrit un fichier que Claudex sait relire', async () => {
    // Un modèle qui ne se résout pas ferait perdre le temps qu'il prétend
    // gagner : on chercherait la faute dans ce qu'on a écrit soi-même.
    const chemin = await ecrireModele(racine)
    expect(chemin).toBe(join(racine, '.claudex', 'services.yml'))

    const { services, reproches } = resoudre(
      parse(await readFile(chemin!, 'utf8')) as Declaration
    )
    expect(reproches).toEqual([])
    expect(services.map((s) => s.nom)).toEqual(['infra'])
  })

  it('ne touche pas à une déclaration déjà là', async () => {
    // Ce serait effacer ce qui marche pour mettre un exemple à la place.
    expect(await ecrireModele(racine)).toBeNull()
    const relu = await readFile(join(racine, '.claudex', 'services.yml'), 'utf8')
    expect(relu).toContain('modeles:')
  })
})
