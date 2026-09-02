import { readdir, readFile, stat } from 'node:fs/promises'
import { extname, join } from 'node:path'
import type { Apercu, Entree } from '@shared/types'

/**
 * Dossiers écartés par défaut de l'arborescence.
 *
 * Ce sont des puits sans intérêt pour la lecture : les parcourir ralentirait
 * l'affichage et noierait ce qu'on cherche.
 */
const IGNORES = new Set([
  'node_modules',
  '.git',
  'dist',
  'out',
  'build',
  '.next',
  '.nuxt',
  'target',
  'venv',
  '.venv',
  '__pycache__',
  '.turbo',
  '.cache',
  'Pods',
  '.gradle',
  '.idea',
  'coverage',
  'test-results',
  'playwright-report'
])

/** Au-delà, un fichier n'est plus prévisualisé : on affiche ses caractéristiques. */
const TAILLE_MAX_APERCU = 1024 * 1024

/** Contenu d'un dossier, dossiers d'abord puis ordre alphabétique. */
export async function lireDossier(chemin: string): Promise<Entree[]> {
  const entrees = await readdir(chemin, { withFileTypes: true })

  const resultat = await Promise.all(
    entrees
      .filter((e) => !IGNORES.has(e.name))
      .map(async (e): Promise<Entree | null> => {
        const complet = join(chemin, e.name)
        // Un lien symbolique est suivi pour savoir s'il mène à un dossier ; s'il
        // est brisé, l'entrée est simplement ignorée.
        try {
          const infos = await stat(complet)
          return {
            nom: e.name,
            chemin: complet,
            dossier: infos.isDirectory(),
            octets: infos.isDirectory() ? 0 : infos.size,
            discrete: e.name.startsWith('.')
          }
        } catch {
          return null
        }
      })
  )

  return resultat
    .filter((e): e is Entree => e !== null)
    .sort((a, b) => {
      if (a.dossier !== b.dossier) return a.dossier ? -1 : 1
      return a.nom.localeCompare(b.nom, 'fr', { numeric: true, sensitivity: 'base' })
    })
}

const LANGAGES: Record<string, string> = {
  '.ts': 'typescript',
  '.tsx': 'typescript',
  '.js': 'javascript',
  '.jsx': 'javascript',
  '.mjs': 'javascript',
  '.cjs': 'javascript',
  '.json': 'json',
  '.md': 'markdown',
  '.css': 'css',
  '.html': 'html',
  '.py': 'python',
  '.rs': 'rust',
  '.go': 'go',
  '.java': 'java',
  '.kt': 'kotlin',
  '.rb': 'ruby',
  '.php': 'php',
  '.sh': 'shell',
  '.zsh': 'shell',
  '.yml': 'yaml',
  '.yaml': 'yaml',
  '.toml': 'toml',
  '.sql': 'sql',
  '.xml': 'xml'
}

/** Un octet nul dans les premiers kilo-octets trahit un fichier binaire. */
function estBinaire(tampon: Buffer): boolean {
  const echantillon = tampon.subarray(0, 8192)
  return echantillon.includes(0)
}

export async function lireApercu(chemin: string): Promise<Apercu> {
  const infos = await stat(chemin)

  // Ouvrir un fichier de plusieurs dizaines de mégaoctets dans un éditeur bloquerait
  // l'interface pour rien : mieux vaut le dire que le tenter.
  if (infos.size > TAILLE_MAX_APERCU) return { type: 'trop-gros', octets: infos.size }

  const tampon = await readFile(chemin)
  if (estBinaire(tampon)) return { type: 'binaire', octets: infos.size }

  return {
    type: 'texte',
    contenu: tampon.toString('utf8'),
    langage: LANGAGES[extname(chemin).toLowerCase()] ?? 'texte',
    octets: infos.size
  }
}
