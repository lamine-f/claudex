/**
 * Donne à l'Electron de développement une signature valide.
 *
 * Le binaire livré par npm arrive scellé par l'éditeur de liens, sans sceau sur
 * ses ressources : `codesign --verify` le refuse. macOS n'accorde pas les
 * notifications à une application dont la signature ne vérifie pas, et il ne le
 * dit pas — l'application croit avoir prévenu, rien n'apparaît.
 *
 * Une signature ad hoc ne prouve aucune provenance ; elle rend seulement le
 * paquet cohérent, ce qui suffit au système pour le laisser notifier. Le paquet
 * livré, lui, est signé à l'empaquetage (voir build/signer-adhoc.mjs).
 *
 * Appelé après chaque installation de dépendances, puisque node_modules repart
 * à zéro à ce moment-là.
 */
import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'

if (process.platform !== 'darwin') process.exit(0)

const application = resolve('node_modules/electron/dist/Electron.app')
if (!existsSync(application)) process.exit(0)

try {
  execFileSync('codesign', ['--verify', '--deep', '--strict', application], { stdio: 'ignore' })
  process.exit(0) // déjà valide : rien à faire
} catch {
  /* signature absente ou incomplète : on la refait */
}

try {
  execFileSync('codesign', ['--force', '--deep', '--sign', '-', application], { stdio: 'ignore' })
  console.log('Electron de développement signé en ad hoc (nécessaire aux notifications macOS).')
} catch (erreur) {
  // Sans elle, seules les notifications manquent : ce n'est pas une raison de
  // faire échouer une installation.
  console.warn('Signature ad hoc impossible :', String(erreur).split('\n')[0])
}
