import { describe, expect, it } from 'vitest'
import { apparier, compter, lireDiff } from '../src/shared/diff'

/** Relevé sur un dépôt d'essai, deux sections et une fin sans retour à la ligne. */
const DEUX_SECTIONS = `diff --git a/a.txt b/a.txt
index 942d4a8..27aaa3c 100644
--- a/a.txt
+++ b/a.txt
@@ -1,5 +1,5 @@
 un
-deux
+deux MODIFIE
 trois
 quatre
 cinq
@@ -9,5 +9,5 @@ huit
 neuf
 dix
 onze
-douze
-treize
+douze MODIFIE
+treize
\\ No newline at end of file
`

describe('lecture d’un diff unifié', () => {
  it('découpe en sections et retient leurs numéros de départ', () => {
    const diff = lireDiff(DEUX_SECTIONS)

    expect(diff.sections).toHaveLength(2)
    expect(diff.sections[0]).toMatchObject({ departGauche: 1, departDroite: 1, entete: '' })
    // git écrit après le second `@@` ce qui donne le contexte, ici la ligne
    // précédente du fichier.
    expect(diff.sections[1]).toMatchObject({ departGauche: 9, departDroite: 9, entete: 'huit' })
  })

  it('numérote les lignes de chaque côté', () => {
    const [premiere] = lireDiff(DEUX_SECTIONS).sections

    expect(premiere?.lignes.slice(0, 3)).toEqual([
      { genre: 'contexte', gauche: 1, droite: 1, texte: 'un' },
      { genre: 'retire', gauche: 2, texte: 'deux' },
      { genre: 'ajoute', droite: 2, texte: 'deux MODIFIE' }
    ])
  })

  it('ignore la mention d’absence de retour à la ligne', () => {
    // git la glisse après la ligne concernée. Elle ne représente aucune ligne du
    // fichier, et la compter décalerait tout ce qui suit.
    const derniere = lireDiff(DEUX_SECTIONS).sections[1]
    expect(derniere?.lignes.map((l) => l.texte)).not.toContain(' No newline at end of file')
    expect(compter(lireDiff(DEUX_SECTIONS))).toEqual({ ajoutees: 3, retirees: 3 })
  })

  it('reconnaît un binaire, que git renonce à comparer', () => {
    const diff = lireDiff(
      'diff --git a/logo.png b/logo.png\nindex 1a2b..3c4d 100644\nBinary files a/logo.png and b/logo.png differ\n'
    )
    expect(diff.binaire).toBe(true)
    expect(diff.sections).toEqual([])
  })

  it('reconnaît un fichier qui n’existait pas', () => {
    const diff = lireDiff(
      'diff --git a/neuf.txt b/neuf.txt\nnew file mode 100644\n--- /dev/null\n+++ b/neuf.txt\n@@ -0,0 +1,2 @@\n+un\n+deux\n'
    )
    expect(diff.ajoute).toBe(true)
    expect(compter(diff)).toEqual({ ajoutees: 2, retirees: 0 })
  })

  it('ne trouve rien dans un diff vide', () => {
    expect(lireDiff('')).toEqual({ sections: [], binaire: false, ajoute: false, supprime: false })
  })

  it('garde une ligne vide pour ce qu’elle est', () => {
    // Une ligne de contexte vide s'écrit « un espace, rien ». La couper au
    // mauvais endroit la ferait disparaître de la vue.
    const diff = lireDiff('--- a/x\n+++ b/x\n@@ -1,3 +1,3 @@\n a\n \n-b\n+c\n')
    expect(diff.sections[0]?.lignes[1]).toEqual({
      genre: 'contexte',
      gauche: 2,
      droite: 2,
      texte: ''
    })
  })
})

describe('appariement pour la vue côte à côte', () => {
  it('met face à face ce qui se remplace', () => {
    const [section] = lireDiff(DEUX_SECTIONS).sections
    const paires = apparier(section!)

    expect(paires[1]).toEqual({
      gauche: { genre: 'retire', gauche: 2, texte: 'deux' },
      droite: { genre: 'ajoute', droite: 2, texte: 'deux MODIFIE' }
    })
    // Le contexte occupe les deux colonnes.
    expect(paires[0]?.gauche).toBe(paires[0]?.droite)
  })

  it('laisse le vide en face de ce qui n’a pas de vis-à-vis', () => {
    // Trois retraits pour un ajout : deux rangées n'ont rien à droite.
    const diff = lireDiff('--- a/x\n+++ b/x\n@@ -1,4 +1,2 @@\n a\n-b\n-c\n-d\n+B\n')
    const paires = apparier(diff.sections[0]!)

    expect(paires).toHaveLength(4)
    expect(paires[1]?.droite).toEqual({ genre: 'ajoute', droite: 2, texte: 'B' })
    expect(paires[2]?.droite).toBeUndefined()
    expect(paires[3]?.droite).toBeUndefined()
    expect(paires[3]?.gauche).toEqual({ genre: 'retire', gauche: 4, texte: 'd' })
  })

  it('n’apparie pas deux blocs séparés par du contexte', () => {
    // Sans la coupure au contexte, le retrait de la ligne 2 ferait face à
    // l'ajout de la ligne 5, qui n'a rien à voir avec lui.
    const diff = lireDiff('--- a/x\n+++ b/x\n@@ -1,4 +1,4 @@\n a\n-b\n c\n+D\n')
    const paires = apparier(diff.sections[0]!)

    expect(paires.map((p) => [p.gauche?.texte, p.droite?.texte])).toEqual([
      ['a', 'a'],
      ['b', undefined],
      ['c', 'c'],
      [undefined, 'D']
    ])
  })
})
