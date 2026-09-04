# Développer Claudex

Ce fichier s'adresse à qui touche au code. Pour installer et se servir de l'application,
voir le [README](README.md).

## Mettre en route

Il faut [Node](https://nodejs.org) 22 ou plus, plus les deux dépendances de l'application
elle-même : [tmux](https://github.com/tmux/tmux/wiki/Installing) et le CLI
[Claude Code](https://docs.claude.com/en/docs/claude-code/setup).

```sh
npm install
npm run dev
```

`npm install` compile `node-pty` pour l'ABI d'Electron et signe l'Electron de développement
en ad hoc — sans quoi macOS lui refuse les notifications, en silence.

## Ce qu'il y a où

```
src/
├── main/            processus principal : tout ce qui touche au système
│   ├── ipc/         la surface exposée au renderer, un fichier par domaine
│   ├── services/    tmux, pty, transcrits, veilleurs, hooks, corbeille, store
│   └── util/        chemins, encodage, garde-fou de sécurité
├── preload/         le pont : contextBridge, aucun accès Node côté interface
├── renderer/        React 19, zustand, Tailwind 4, xterm.js
└── shared/          types et logique pure, partagés par les trois
```

Le renderer n'a jamais accès à Node : `contextIsolation`, `sandbox`, aucune navigation, et
toute opération de fichier vérifie côté main que le chemin reste sous un projet enregistré.

La logique qui peut être pure l'est, dans `src/shared/` : l'encodage des chemins, le nommage
des branches, le rangement des conversations, le contrôle du pont. C'est ce qui se teste sans
lancer quoi que ce soit.

## Tests

```sh
npm test            # unitaires et intégration (vitest)
npm run test:e2e    # bout en bout, sur l'application réelle (playwright)
npm run test:all    # les deux
```

Les tests de bout en bout lancent Claudex sur un profil jetable et un serveur tmux à part
(`claudex-test`), et nettoient les dossiers de transcrits qu'ils créent. Ils ne touchent ni à
l'état ni aux sessions de l'application ouverte à côté — la règle vient d'un `kill-server`
malheureux sur le socket de production.

Deux variables d'environnement servent à cet isolement, utiles aussi à la main :

| | |
|---|---|
| `CLAUDEX_TMUX_SOCKET` | nom du socket tmux (défaut : `claudex`) |
| `CLAUDEX_HOOKS_DIR` | dossier des hooks et des événements (défaut : `~/.claude/claudex`) |

## Empaqueter

```sh
npm run dist        # dist/Claudex-<version>-arm64.dmg
```

Un crochet `afterPack` signe l'application en ad hoc et retire le dossier de sortie de l'index de Spotlight. Sans certificat de développeur, le
paquet garderait l'identité de code du binaire Electron et sa signature ne vérifierait pas —
et macOS refuse les notifications à une application dans cet état, sans rien dire. Une
signature ad hoc ne prouve aucune provenance : elle rend seulement le paquet cohérent avec
son identifiant, ce que le système exige.

La commande finit par un test de bout en bout sur le paquet lui-même : il doit ouvrir un vrai
terminal, seule façon de vérifier que `node-pty` a survécu à l'archive asar.

## Outils

```sh
node scripts/essai-notification.mjs          # déclenche une notification comme le ferait un agent
node scripts/vitrine.mjs docs                # regénère la galerie du README
node scripts/icone.mjs                       # recompose l'icône depuis le logo
CLAUDEX_CAPTURE_PROJETS=~/code/a:~/code/b \
  npm run captures                           # captures sur de vrais projets
npm run capture                              # capture par CDP, sans perturber la fenêtre
```

`icone.mjs` compose `build/icon.png` et `docs/logo.png` à partir de
`src/renderer/public/logo.png`, sur fond transparent. Un carré blanc derrière l'icône se voyait
dans le Dock et en tête de la page du dépôt.

`vitrine.mjs` fabrique tout ce qu'il montre — un dépôt jetable dans `/tmp/atelier`, des
conversations inventées, un profil neuf — et remplace l'invite du shell : les captures du
dépôt ne doivent rien devoir à la machine qui les produit.

## Points de vigilance

**Les cibles tmux.** Une session se désigne par `=nom`, un pane par `=nom:` — avec le
deux-points. L'oublier donne un « can't find pane » qui ne dit pas pourquoi.

**Un client par onglet.** L'attachement passe par `attach-session -d` : sans le `-d`, un
client orphelin reste accroché et chaque frappe s'affiche en double.

**Le registre des pty.** Un `onExit` asynchrone ne doit retirer une entrée que si elle
désigne encore *son* processus — sinon le pty qui vient de le remplacer est effacé du
registre, et le clavier meurt sans erreur.

**Les transcrits géants.** Jamais de `readFile` sur un `.jsonl` : uniquement des flux, avec
un plafond. Un seul fichier de 175 Mo suffit à mettre l'application à genoux.

**Le preload ne se recharge pas à chaud.** En développement, l'interface peut appeler une
méthode que le pont n'expose pas encore ; l'appel échoue alors en silence. Un contrôle au
démarrage (`src/shared/pont.ts`) nomme la méthode manquante et demande un redémarrage.

**Le champ `cwd` des transcrits ne vaut rien** pour l'appariement : il rapporte `/home/...`
sur une machine en `/Users/...`. Seul le nom de dossier calculé fait foi.

## Langue

Le code, les commentaires et les messages de commit sont en français. Les commentaires disent
*pourquoi*, pas *quoi* : ce qui a été essayé et n'a pas marché, la contrainte qui a imposé la
forme. Le reste, le code le dit déjà.
