/**
 * Ce qui suit l'installation des dépendances.
 *
 * `electron-builder install-app-deps` recompile les modules natifs pour l'ABI
 * d'Electron. Sur Windows il échoue, faute de Python et des outils de compilation
 * de Visual Studio — et il échoue pour rien : node-pty 1.1 est passé à Node-API,
 * dont l'ABI est stable d'une version de Node à l'autre et d'un Electron à
 * l'autre. Ses binaires livrés (`prebuilds/win32-x64`) se chargent tels quels.
 *
 * La recompilation est donc sautée là où elle n'apporte rien plutôt qu'exiger de
 * chaque contributeur Windows plusieurs gigaoctets d'outils de compilation. Elle
 * reste jouée sur macOS, où le chemin d'installation d'avant le portage ne doit
 * pas bouger tant que personne ne l'a vérifié.
 */
import { execFileSync } from 'node:child_process'

const surWindows = process.platform === 'win32'

if (surWindows) {
  console.log(
    'Modules natifs : recompilation sautée, node-pty est en Node-API et ses binaires suffisent.'
  )
} else {
  execFileSync('npx', ['electron-builder', 'install-app-deps'], { stdio: 'inherit' })
}

execFileSync(process.execPath, ['scripts/signer-electron-dev.mjs'], { stdio: 'inherit' })
