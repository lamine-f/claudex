import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import type { EtatGit } from '@shared/types'

const run = promisify(execFile)

/**
 * État git d'un projet, tel qu'affiché dans la barre de statut.
 *
 * Volontairement minimal : la branche et le nombre de fichiers touchés suffisent
 * à savoir où l'on est. Un dossier hors dépôt n'est pas une erreur — beaucoup de
 * projets n'en sont pas.
 */
export async function etat(chemin: string): Promise<EtatGit | null> {
  try {
    const [branche, statut] = await Promise.all([
      run('git', ['-C', chemin, 'rev-parse', '--abbrev-ref', 'HEAD'], { timeout: 4000 }),
      run('git', ['-C', chemin, 'status', '--porcelain'], { timeout: 4000, maxBuffer: 4 * 1024 * 1024 })
    ])

    const lignes = statut.stdout.split('\n').filter(Boolean)
    return {
      branche: branche.stdout.trim(),
      modifies: lignes.filter((l) => !l.startsWith('??')).length,
      nonSuivis: lignes.filter((l) => l.startsWith('??')).length
    }
  } catch {
    return null
  }
}
