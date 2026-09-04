# Développer Claudex

Ce fichier s'adresse à qui touche au code. Pour installer et se servir de l'application,
voir le [README](README.md).

## Mettre en route

Il faut [Node](https://nodejs.org) 22 ou plus et le CLI
[Claude Code](https://docs.claude.com/en/docs/claude-code/setup). Sur macOS, il faut aussi
[tmux](https://github.com/tmux/tmux/wiki/Installing) ; sur Windows, rien de plus.

```sh
npm install
npm run dev
```

`npm install` signe l'Electron de développement en ad hoc — sans quoi macOS lui refuse les
notifications, en silence — et, sur macOS seulement, recompile `node-pty` pour l'ABI d'Electron.

**Windows ne demande ni Python ni les outils de compilation de Visual Studio.** C'est le
premier réflexe quand `node-gyp` échoue, et il est inutile ici : `node-pty` 1.1 est passé à
Node-API, dont l'ABI est stable d'une version de Node à l'autre et d'un Electron à l'autre. Ses
binaires livrés dans `prebuilds/win32-x64` se chargent tels quels. C'est
`electron-builder install-app-deps` qui déclenchait une recompilation dont personne n'avait
besoin, et `scripts/apres-installation.mjs` la saute là où elle n'apporte rien.

Le premier `npm test` sur Windows affiche des `Error: AttachConsole failed` entre les résultats.
Ils viennent d'un utilitaire que `node-pty` lance pour énumérer les processus d'une console au
moment de tuer un pty, et qui échoue faute de console attachée. Vérifié : le pty et ses enfants
sont bien tués malgré cela. C'est du bruit sur `stderr`, pas une fuite.

## Ce qu'il y a où

```
src/
├── main/            processus principal : tout ce qui touche au système
│   ├── ipc/         la surface exposée au renderer, un fichier par domaine
│   ├── services/    pty, transcrits, veilleurs, hooks, corbeille, store
│   │   └── multiplexeur/  un pilote de terminal par plateforme
│   └── util/        chemins, encodage, garde-fou de sécurité
├── preload/         le pont : contextBridge, aucun accès Node côté interface
├── renderer/        React 19, zustand, Tailwind 4, xterm.js
└── shared/          types et logique pure, partagés par les trois
```

## Le multiplexeur

`src/main/services/multiplexeur/` est le seul endroit qui sait sur quel système on tourne pour
ce qui touche aux terminaux. `types.ts` dit ce que Claudex attend d'un multiplexeur, `tmux.ts`
et `conpty.ts` le fournissent, `index.ts` choisit. Le reste de l'application importe
`multiplexeur` et ne pose pas la question.

Les deux pilotes ne promettent pas la même chose, et l'interface l'expose : `persistant` vaut
`true` pour tmux, `false` pour ConPTY. L'écran d'état s'en sert pour prévenir plutôt que de
laisser découvrir. Un pilote WSL, ou un processus courtier détaché qui rendrait la persistance
à Windows, se brancherait là sans toucher au reste.

Trois méthodes ne viennent pas de tmux et méritent leur raison d'être.

`attacher` a remplacé `attachArgs`, qui rendait une ligne de commande. Cela supposait qu'un
client se lance pour rejoindre une session qui existe sans lui ; sur Windows le pty *est* la
session, il n'y a rien à rejoindre. Le pilote rend donc le processus, et `pty.ts` n'a plus que
le registre à tenir.

`detacher` existe parce que le geste n'a pas le même sens des deux côtés : détacher un client
tmux le tue et la session continue, tuer un pty ConPTY emporte le shell.

`assurer` reçoit l'amorce en deux morceaux — la commande, et le fichier d'écran à réafficher —
plutôt qu'une chaîne toute faite. La composer demandait de savoir écrire du shell, et
`cat -- fichier; commande` ne veut rien dire pour PowerShell.

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

Quelques cas sont réservés à une plateforme, et toujours parce que leur objet n'y existe pas.
`tmux.integration.test.ts` pilote un vrai serveur tmux, `conpty.integration.test.ts` de vrais
pty ConPTY : chacun s'écarte là où l'autre tourne. `persistance.spec.ts` vérifie qu'un terminal
survit à la fermeture de l'application, ce que le pilote ConPTY ne prétend pas faire ; ce que
Windows sait faire à la place est vérifié par `reboot.spec.ts`, qui part précisément d'un état
où plus aucune session ne subsiste. Un cas écarté le dit et dit pourquoi ; aucun n'est désarmé.

Deux variables d'environnement servent à cet isolement, utiles aussi à la main :

| | |
|---|---|
| `CLAUDEX_TMUX_SOCKET` | nom du socket tmux (défaut : `claudex`) |
| `CLAUDEX_HOOKS_DIR` | dossier des hooks et des événements (défaut : `~/.claude/claudex`) |

## Empaqueter

```sh
npm run dist        # macOS  : dist/Claudex-<version>-arm64.dmg
npm run dist:win    # Windows : dist/Claudex Setup <version>.exe
```

L'installateur Windows est un NSIS posé pour l'utilisateur courant : il ne demande pas
d'élévation, ce qui n'apporterait rien à une application rangée dans son propre dossier. Il
n'est pas signé, et SmartScreen le dira au premier lancement.

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

### Propres à Windows

**La console n'écrit pas en UTF-8.** Une console Windows encode dans la page de codes du poste :
le tiret cadratin d'un écran réaffiché ressortait en trait d'union, et les traits de cadre dont
Claude Code dessine son interface en caractères de remplacement. Chaque session commence donc
par poser `[Console]::OutputEncoding` et `$OutputEncoding` en UTF-8, ce que node-pty et xterm
attendent des deux côtés.

**Un `.ps1` sans marque d'ordre des octets est lu en ANSI** par Windows PowerShell 5.1. Les
accents des commentaires en ressortaient abîmés, et une chaîne accentuée — le titre d'une
bifurcation — faisait échouer l'analyse du script. Le script de hook comme les scripts d'amorce
sont écrits avec leur BOM.

**Le hook a besoin de `-ExecutionPolicy Bypass`.** La politique par défaut d'un poste Windows
refuse d'exécuter un script local, et le hook échouait sans que rien ne le dise.

**`process.env.HOME` n'existe pas.** `os.homedir()` lit `USERPROFILE`. Un test qui forçait
`HOME` pour se donner une maison jetable écrivait en réalité dans le vrai `~/.claude`.

**Un dossier reste verrouillé après le `kill`** d'un processus qui l'avait pour répertoire
courant : `rm` répond `EBUSY`. Les nettoyages de test passent par `maxRetries`.

**`~/.local/bin` n'est pas dans le PATH** juste après l'installation de Claude Code : son
installateur ne l'ajoute qu'à la session Windows suivante. Le pilote ConPTY l'ajoute au PATH des
shells qu'il lance quand `claude.exe` s'y trouve, et l'écran d'état y cherche le binaire avant
de conclure qu'il manque.

## Langue

Le code, les commentaires et les messages de commit sont en français. Les commentaires disent
*pourquoi*, pas *quoi* : ce qui a été essayé et n'a pas marché, la contrainte qui a imposé la
forme. Le reste, le code le dit déjà.
