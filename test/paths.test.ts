import { describe, expect, it } from 'vitest'
import {
  assertInsideWorkspace,
  encodeProjectDir,
  tmuxSessionName
} from '../src/main/util/paths'

describe('encodeProjectDir', () => {
  // Ces paires reprennent la forme de cas relevés sur une vraie machine —
  // espaces, accents, apostrophes, tirets déjà présents, mélange de séparateurs
  // — chacune vérifiée contre le contenu réel de ~/.claude/projects. Les noms
  // sont neutres : ce qui compte ici est la ponctuation, jamais le mot.
  const cas: Array<[string, string]> = [
    ['/Users/ada/Workspace/Mon IDE fait maison', '-Users-ada-Workspace-Mon-IDE-fait-maison'],
    [
      '/Users/ada/Workspace/Acme/Boutique/boutique_clients/web_clients/boutique_front',
      '-Users-ada-Workspace-Acme-Boutique-boutique-clients-web-clients-boutique-front'
    ],
    [
      '/Users/ada/Workspace/je porte la casquette sur mon app',
      '-Users-ada-Workspace-je-porte-la-casquette-sur-mon-app'
    ],
    // Accents et apostrophe : chaque caractère non alphanumérique compte pour un tiret.
    [
      "/Users/ada/Workspace/voir si le téléphone n'est pas éteint",
      '-Users-ada-Workspace-voir-si-le-t-l-phone-n-est-pas--teint'
    ],
    ['/Users/ada/Downloads/tmp', '-Users-ada-Downloads-tmp'],
    // Un tiret déjà présent est conservé tel quel.
    [
      '/Users/ada/Workspace/Acme/Boutique/boutique_services/metabase-backup',
      '-Users-ada-Workspace-Acme-Boutique-boutique-services-metabase-backup'
    ]
  ]

  it.each(cas)('%s', (chemin, attendu) => {
    expect(encodeProjectDir(chemin)).toBe(attendu)
  })

  it('est à sens unique : deux chemins peuvent produire le même dossier', () => {
    expect(encodeProjectDir('/a/b c')).toBe(encodeProjectDir('/a/b_c'))
  })
})

describe('assertInsideWorkspace', () => {
  const roots = ['/Users/x/projet', '/Users/x/autre']

  it('accepte le workspace lui-même et sa descendance', () => {
    expect(assertInsideWorkspace('/Users/x/projet', roots)).toBe('/Users/x/projet')
    expect(assertInsideWorkspace('/Users/x/projet/src/a.ts', roots)).toBe(
      '/Users/x/projet/src/a.ts'
    )
  })

  it('refuse un chemin extérieur', () => {
    expect(() => assertInsideWorkspace('/etc/passwd', roots)).toThrow()
  })

  it("refuse un dossier voisin dont le nom commence pareil", () => {
    expect(() => assertInsideWorkspace('/Users/x/projet-secret/a', roots)).toThrow()
  })

  it('refuse une remontée par ..', () => {
    expect(() => assertInsideWorkspace('/Users/x/projet/../../secret', roots)).toThrow()
  })
})

describe('tmuxSessionName', () => {
  it('ne produit que des caractères sûrs pour une cible tmux', () => {
    const nom = tmuxSessionName('ws-1.a', 'tab:2')
    expect(nom).toBe('cdx_ws1a_tab2')
    expect(nom).not.toMatch(/[.:]/)
  })
})
