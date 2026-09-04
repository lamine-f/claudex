import { copyFile, mkdir, rename, rm, stat } from 'node:fs/promises'
import { basename, join } from 'node:path'
import { app } from 'electron'

/**
 * Conversations écartées.
 *
 * Le transcrit est déplacé, jamais effacé : c'est le seul exemplaire d'un
 * travail parfois long, et une suppression définitive au clic droit serait une
 * mauvaise surprise. Le fichier reste récupérable à la main.
 */
export function dossierCorbeille(): string {
  return join(app.getPath('userData'), 'corbeille')
}

/** Écarte un transcrit et rend le chemin où il a été déposé. */
export async function ecarter(cheminTranscrit: string): Promise<string> {
  await stat(cheminTranscrit)
  const corbeille = dossierCorbeille()
  await mkdir(corbeille, { recursive: true })

  // Horodater évite d'écraser une conversation écartée plus tôt sous le même nom.
  const horodatage = new Date().toISOString().replace(/[:.]/g, '-')
  const destination = join(corbeille, `${horodatage}--${basename(cheminTranscrit)}`)

  try {
    await rename(cheminTranscrit, destination)
  } catch (erreur) {
    if ((erreur as NodeJS.ErrnoException).code !== 'EXDEV') throw erreur
    // Les données de l'application et celles de Claude Code ne sont pas
    // toujours sur le même système de fichiers. Un /home monté à part suffit à
    // les séparer, et les tests y tombent aussitôt puisque /tmp est un tmpfs
    // sous Linux. `rename` refuse alors de franchir la frontière. Le cas ne se
    // présentait pas sur macOS, où dossier temporaire et dossier personnel
    // partagent le même volume.
    await copyFile(cheminTranscrit, destination)
    await rm(cheminTranscrit, { force: true })
  }
  return destination
}
