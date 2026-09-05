import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import { Readable } from 'node:stream'
import { protocol } from 'electron'
import { SCHEMA_MEDIA, bornes, cheminDeLUrl, media } from '@shared/media'
import { assertInsideWorkspace } from '../util/paths'
import * as store from './store'

/**
 * Le schéma par lequel l'aperçu atteint une image ou une vidéo du disque.
 *
 * Passer le fichier par le pont le chargerait tout entier en mémoire, puis une
 * seconde fois en base64 : une vidéo de trois cents mégaoctets en ferait quatre
 * cents de chaîne. Le schéma le sert en flux, et le lecteur ne demande que les
 * morceaux qu'il joue.
 *
 * Il est déclaré privilégié avant que l'application ne soit prête, comme
 * Electron l'exige. `stream` autorise les requêtes partielles, sans lesquelles
 * une vidéo se lit du début à la fin sans qu'on puisse s'y déplacer.
 */
export function declarerSchema(): void {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: SCHEMA_MEDIA,
      privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true }
    }
  ])
}

/**
 * Sert un fichier du disque, en entier ou par morceaux.
 *
 * Le chemin est vérifié comme n'importe quel accès au disque : sans cela, une
 * adresse fabriquée dans la page donnerait à lire tout ce que l'utilisateur
 * peut lire.
 */
export function servirMedias(): void {
  protocol.handle(SCHEMA_MEDIA, async (requete) => {
    const demande = cheminDeLUrl(requete.url)
    if (!demande) return new Response('Adresse sans chemin', { status: 400 })

    let chemin: string
    try {
      chemin = assertInsideWorkspace(
        demande,
        store.get().workspaces.map((w) => w.path)
      )
    } catch {
      return new Response('Chemin hors des projets', { status: 403 })
    }

    const type = media(chemin)
    if (!type) return new Response('Ce fichier n’est pas un média', { status: 415 })

    const infos = await stat(chemin).catch(() => null)
    if (!infos?.isFile()) return new Response('Fichier introuvable', { status: 404 })

    const commun = { 'Content-Type': type.mime, 'Accept-Ranges': 'bytes' }
    const morceau = bornes(requete.headers.get('Range'), infos.size)

    if (!morceau) {
      const flux = Readable.toWeb(createReadStream(chemin)) as ReadableStream
      return new Response(flux, {
        status: 200,
        headers: { ...commun, 'Content-Length': String(infos.size) }
      })
    }

    const { debut, fin } = morceau
    const flux = Readable.toWeb(createReadStream(chemin, { start: debut, end: fin })) as ReadableStream
    return new Response(flux, {
      status: 206,
      headers: {
        ...commun,
        'Content-Length': String(fin - debut + 1),
        'Content-Range': `bytes ${debut}-${fin}/${infos.size}`
      }
    })
  })
}
