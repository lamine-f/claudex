/**
 * Le libellé d'un raccourci d'application, dans la convention de son système.
 *
 * Il vit dans `shared` parce que trois endroits doivent s'accorder dessus :
 * l'interface qui l'affiche, la touche que le renderer écoute, et les tests de
 * bout en bout qui cliquent un bouton désigné par son titre. Les avoir écrits
 * séparément faisait passer une suite verte sur une interface où plus rien ne
 * portait le bon nom.
 *
 * Windows n'a pas de touche réservée à l'application : `Ctrl` seul appartient au
 * shell, où `Ctrl+E` va en fin de ligne et `Ctrl+W` efface le mot précédent. Les
 * prendre à son compte les volerait au terminal, qui est ce que l'utilisateur est
 * venu voir. D'où `Ctrl+Maj`, la convention de Windows Terminal et de VS Code.
 */
export function raccourci(plateforme: NodeJS.Platform, touche: string): string {
  return plateforme === 'darwin' ? `⌘${touche}` : `Ctrl+Maj+${touche}`
}
