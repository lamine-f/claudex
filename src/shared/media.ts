/**
 * Ce que Claudex sait montrer sans le lire comme du texte.
 *
 * L'extension suffit : deviner le type au contenu demanderait d'ouvrir le
 * fichier, ce qu'on veut justement éviter sur une vidéo de trois cents
 * mégaoctets. Un format absent de la table reste un fichier binaire, ce qui est
 * la vérité de ce que l'application sait en faire.
 */

export type GenreMedia = 'image' | 'video' | 'audio'

/** Le schéma d'URL par lequel le renderer atteint un média du disque. */
export const SCHEMA_MEDIA = 'claudex-media'

const TABLE: Record<string, { genre: GenreMedia; mime: string }> = {
  '.png': { genre: 'image', mime: 'image/png' },
  '.jpg': { genre: 'image', mime: 'image/jpeg' },
  '.jpeg': { genre: 'image', mime: 'image/jpeg' },
  '.gif': { genre: 'image', mime: 'image/gif' },
  '.webp': { genre: 'image', mime: 'image/webp' },
  '.avif': { genre: 'image', mime: 'image/avif' },
  '.bmp': { genre: 'image', mime: 'image/bmp' },
  '.ico': { genre: 'image', mime: 'image/x-icon' },
  '.svg': { genre: 'image', mime: 'image/svg+xml' },
  '.mp4': { genre: 'video', mime: 'video/mp4' },
  '.m4v': { genre: 'video', mime: 'video/mp4' },
  '.webm': { genre: 'video', mime: 'video/webm' },
  '.mov': { genre: 'video', mime: 'video/quicktime' },
  '.ogv': { genre: 'video', mime: 'video/ogg' },
  '.mp3': { genre: 'audio', mime: 'audio/mpeg' },
  '.m4a': { genre: 'audio', mime: 'audio/mp4' },
  '.wav': { genre: 'audio', mime: 'audio/wav' },
  '.flac': { genre: 'audio', mime: 'audio/flac' },
  '.oga': { genre: 'audio', mime: 'audio/ogg' },
  '.ogg': { genre: 'audio', mime: 'audio/ogg' },
  '.aac': { genre: 'audio', mime: 'audio/aac' }
}

/** L'extension d'un chemin, en minuscules, séparateurs des deux systèmes admis. */
function extension(chemin: string): string {
  const nom = chemin.split(/[\\/]/).pop() ?? ''
  const point = nom.lastIndexOf('.')
  // Un nom qui commence par un point n'a pas d'extension : « .gitignore » est
  // un fichier nommé ainsi, pas un fichier « gitignore ».
  return point <= 0 ? '' : nom.slice(point).toLowerCase()
}

export function media(chemin: string): { genre: GenreMedia; mime: string } | undefined {
  return TABLE[extension(chemin)]
}

/**
 * L'adresse par laquelle le renderer demande un fichier du disque.
 *
 * Le chemin passe encodé dans le corps de l'URL plutôt qu'en paramètre : il
 * porte des espaces, des accents et des séparateurs, et l'encoder d'un bloc
 * évite d'avoir à deviner ce qui est séparateur et ce qui est contenu.
 */
export function urlMedia(chemin: string): string {
  return `${SCHEMA_MEDIA}://fichier/${encodeURIComponent(chemin)}`
}

/** Le chemin que porte une telle adresse, ou rien si elle n'en porte pas. */
export function cheminDeLUrl(url: string): string | undefined {
  const chemin = decodeURIComponent(new URL(url).pathname.replace(/^\//, ''))
  return chemin === '' ? undefined : chemin
}

/**
 * Ce que demande un en-tête `Range`, ramené à des bornes sûres.
 *
 * Un lecteur vidéo réclame les morceaux qu'il joue, et redemande le début dès
 * qu'on se déplace dans la barre. Sans réponse partielle, il télécharge tout le
 * fichier pour lire une seconde, et l'on ne peut pas s'y déplacer.
 *
 * Une demande qu'on ne sait pas satisfaire rend `null`, et le fichier part
 * alors en entier : c'est toujours une réponse juste, seulement moins fine.
 */
export function bornes(
  entete: string | null | undefined,
  taille: number
): { debut: number; fin: number } | null {
  const demande = /^bytes=(\d*)-(\d*)$/.exec(entete ?? '')
  if (!demande) return null

  const [, brutDebut, brutFin] = demande
  // « bytes=-500 » demande les cinq cents derniers octets, pas les premiers.
  if (!brutDebut && !brutFin) return null
  const debut = brutDebut ? Number(brutDebut) : Math.max(0, taille - Number(brutFin))
  const fin = brutDebut && brutFin ? Math.min(Number(brutFin), taille - 1) : taille - 1
  if (debut > fin || debut >= taille || debut < 0) return null
  return { debut, fin }
}
