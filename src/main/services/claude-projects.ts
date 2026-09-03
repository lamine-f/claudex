import { createReadStream } from 'node:fs'
import { readdir, stat } from 'node:fs/promises'
import { basename, join } from 'node:path'
import { createInterface } from 'node:readline'
import type { ClaudeSession } from '@shared/types'
import { claudeProjectPath } from '../util/paths'

/**
 * Plafonds de lecture d'un transcript.
 *
 * Les métadonnées recherchées apparaissent dans les premières dizaines de lignes,
 * alors qu'un transcript peut peser plus de cent mégaoctets. Lire au-delà de ces
 * limites ne rapporterait rien et suffirait à mettre l'application à genoux.
 */
const MAX_LIGNES = 200
const MAX_OCTETS = 256 * 1024

interface EnTete {
  titre?: string
  titreDeRepli?: string
  gitBranch?: string
  premierHorodatage?: number
}

/**
 * Lit le début d'un transcript et s'arrête dès qu'il tient ce qu'il cherche.
 * Le flux est refermé sans lire la suite du fichier.
 */
async function lireEnTete(chemin: string): Promise<EnTete> {
  const enTete: EnTete = {}
  const flux = createReadStream(chemin, { encoding: 'utf8', end: MAX_OCTETS })
  const lecteur = createInterface({ input: flux, crlfDelay: Number.POSITIVE_INFINITY })

  let lignes = 0
  try {
    for await (const ligne of lecteur) {
      if (++lignes > MAX_LIGNES) break

      let objet: Record<string, unknown>
      try {
        objet = JSON.parse(ligne) as Record<string, unknown>
      } catch {
        continue // ligne tronquée par le plafond d'octets
      }

      if (objet.type === 'ai-title' && typeof objet.aiTitle === 'string') {
        enTete.titre = objet.aiTitle
      }
      if (typeof objet.gitBranch === 'string' && !enTete.gitBranch) {
        enTete.gitBranch = objet.gitBranch
      }
      if (typeof objet.timestamp === 'string' && !enTete.premierHorodatage) {
        const date = Date.parse(objet.timestamp)
        if (!Number.isNaN(date)) enTete.premierHorodatage = date
      }
      if (objet.type === 'user' && !enTete.titreDeRepli) {
        enTete.titreDeRepli = extraireTexte(objet)
      }

      // Le titre est le seul élément indispensable : dès qu'il est là, inutile
      // de poursuivre.
      if (enTete.titre && enTete.gitBranch && enTete.premierHorodatage) break
    }
  } finally {
    lecteur.close()
    flux.destroy()
  }

  return enTete
}

/** Premier message de l'utilisateur, tronqué, qui sert de titre de repli. */
function extraireTexte(objet: Record<string, unknown>): string | undefined {
  const message = objet.message as { content?: unknown } | undefined
  const contenu = message?.content
  let texte = ''

  if (typeof contenu === 'string') {
    texte = contenu
  } else if (Array.isArray(contenu)) {
    texte = contenu
      .map((bloc) =>
        typeof bloc === 'object' && bloc && 'text' in bloc ? String((bloc as { text: unknown }).text) : ''
      )
      .join(' ')
  }

  texte = texte.replace(/\s+/g, ' ').trim()
  if (!texte || texte.startsWith('<')) return undefined
  return texte.length > 70 ? `${texte.slice(0, 70)}…` : texte
}

/**
 * Sessions Claude Code d'un workspace, les plus récentes d'abord.
 *
 * Seul le dossier exact est lu, comme le fait `/resume` : un dossier parent ne
 * remonte pas les conversations de ses sous-projets, qui possèdent leur propre
 * dossier de transcrits. Un dossier absent signifie simplement que `claude` n'a
 * jamais été lancé là — ce n'est pas une erreur.
 */
export async function listerSessions(
  cheminWorkspace: string,
  noms: Record<string, string> = {},
  etiquettes: Record<string, string> = {}
): Promise<ClaudeSession[]> {
  const dossier = claudeProjectPath(cheminWorkspace)

  let fichiers: string[]
  try {
    fichiers = (await readdir(dossier)).filter((f) => f.endsWith('.jsonl'))
  } catch {
    return []
  }

  const sessions = await Promise.all(
    fichiers.map(async (fichier): Promise<ClaudeSession | null> => {
      const chemin = join(dossier, fichier)
      let infos
      try {
        infos = await stat(chemin)
      } catch {
        return null
      }

      const enTete = await lireEnTete(chemin)
      const id = basename(fichier, '.jsonl')
      // Un nom donné à la main l'emporte : il dit ce qu'on explore, là où le
      // titre généré ne résume que les premiers échanges.
      const titre = noms[id] ?? enTete.titre ?? enTete.titreDeRepli

      // Sans titre ni premier message, le transcript ne porte aucune conversation
      // (fichiers « bridge-session », sessions avortées) : l'afficher n'aurait
      // aucun sens.
      if (!titre) return null

      return {
        id,
        titre,
        titreDeRepli: !noms[id] && !enTete.titre,
        etiquette: etiquettes[id],
        gitBranch: enTete.gitBranch,
        debutLe: enTete.premierHorodatage,
        misAJourLe: infos.mtimeMs,
        octets: infos.size,
        epinglee: false
      }
    })
  )

  return sessions
    .filter((s): s is ClaudeSession => s !== null)
    .sort((a, b) => b.misAJourLe - a.misAJourLe)
}
