/**
 * Le test de bout en bout du paquet, lancé après sa construction.
 *
 * Il tient dans un script parce que `CLAUDEX_TEST_PAQUET=1 playwright test` est
 * une syntaxe de shell POSIX : sur Windows, `cmd` la prend pour un nom de
 * commande et la ligne échoue avant d'avoir rien lancé.
 */
import { spawnSync } from 'node:child_process'

const resultat = spawnSync('npx', ['playwright', 'test', 'e2e/paquet.spec.ts'], {
  stdio: 'inherit',
  env: { ...process.env, CLAUDEX_TEST_PAQUET: '1' },
  shell: process.platform === 'win32'
})

process.exit(resultat.status ?? 1)
