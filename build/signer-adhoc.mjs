import { execFileSync } from 'node:child_process'
import { join } from 'node:path'

/**
 * Signe l'application en ad hoc, après empaquetage.
 *
 * Sans certificat de développeur, electron-builder laisse le paquet avec la
 * signature héritée du binaire Electron : son identité de code reste
 * « Electron », et la vérification échoue faute de sceau sur les ressources
 * ajoutées. macOS refuse alors les notifications à cette application — sans
 * rien dire, ce qui est le plus déroutant.
 *
 * Une signature ad hoc ne prouve aucune provenance et ne remplace pas un
 * certificat : elle donne seulement au paquet une identité de code cohérente
 * avec son identifiant, ce que le système exige avant de laisser notifier.
 *
 * `--deep` est déconseillé par Apple pour une distribution signée ; ici, où il
 * n'y a ni certificat ni notarisation à préserver, c'est la façon la plus sûre
 * de n'oublier aucun binaire embarqué — node-pty et son `spawn-helper` compris.
 */
export default async function signerAdHoc({ appOutDir, packager, electronPlatformName }) {
  if (electronPlatformName !== 'darwin') return
  const application = join(appOutDir, `${packager.appInfo.productFilename}.app`)
  execFileSync('codesign', ['--force', '--deep', '--sign', '-', application], {
    stdio: 'inherit'
  })
  execFileSync('codesign', ['--verify', '--deep', '--strict', application], { stdio: 'inherit' })
  console.log('  • signature ad hoc posée  file=%s', application)
}
