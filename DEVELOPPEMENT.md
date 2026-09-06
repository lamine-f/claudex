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

`npm install` signe l'Electron de développement en ad hoc, sans quoi macOS lui refuse les
notifications en silence. La signature ne s'applique qu'à macOS et se passe ailleurs sans rien
faire. Sur macOS seulement, `node-pty` est aussi recompilé pour l'ABI d'Electron.

**Windows ne demande ni Python ni les outils de compilation de Visual Studio.** C'est le
premier réflexe quand `node-gyp` échoue, et il est inutile ici : `node-pty` 1.1 est passé à
Node-API, dont l'ABI est stable d'une version de Node à l'autre et d'un Electron à l'autre. Ses
binaires livrés dans `prebuilds/win32-x64` se chargent tels quels. C'est
`electron-builder install-app-deps` qui déclenchait une recompilation dont personne n'avait
besoin, et `scripts/apres-installation.mjs` la saute là où elle n'apporte rien.

`npm run dev` commence par `npm run icones`, qui fabrique un fichier ignoré par git. Sans lui
un dépôt fraîchement cloné ne démarre pas, sur aucun système.

Le premier `npm test` sur Windows affiche des `Error: AttachConsole failed` entre les résultats.
Ils viennent d'un utilitaire que `node-pty` lance pour énumérer les processus d'une console au
moment de tuer un pty, et qui échoue faute de console attachée. Vérifié : le pty et ses enfants
sont bien tués malgré cela. C'est du bruit sur `stderr`, pas une fuite.

L'option `useConptyDll` de node-pty le fait disparaître, et elle a été essayée puis écartée : à
`spawn` et `kill` équivalents au milliseconde près, elle triple le temps que met une sortie à
revenir — 30,6 s contre 14,2 s sur la suite unitaire, mesuré deux fois de chaque côté. Un
message que personne ne lit coûte moins cher qu'un terminal qui traîne.

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

Quatre méthodes ne viennent pas de tmux et méritent leur raison d'être.

`attacher` a remplacé `attachArgs`, qui rendait une ligne de commande. Cela supposait qu'un
client se lance pour rejoindre une session qui existe sans lui ; sur Windows le pty *est* la
session, il n'y a rien à rejoindre. Le pilote rend donc le processus, et `pty.ts` n'a plus que
le registre à tenir.

`detacher` existe parce que le geste n'a pas le même sens des deux côtés : détacher un client
tmux le tue et la session continue, tuer un pty ConPTY emporte le shell.

`assurer` reçoit l'amorce en deux morceaux — la commande, et le fichier d'écran à réafficher —
plutôt qu'une chaîne toute faite. La composer demandait de savoir écrire du shell, et
`cat -- fichier; commande` ne veut rien dire pour PowerShell.

`redimensionner` est passé du pty au pilote. Transmettre la taille au processus suffisait tant
que personne ne tenait d'écran de son côté ; ce n'est plus le cas.

### L'écran du pilote ConPTY

tmux tient l'écran de son pane et sait le rendre. Le pilote ConPTY n'avait, lui, qu'un tampon des
octets sortis du pty — et un flux porte les ordres qui ont dessiné un écran, pas le dessin. Une
barre de progression qui se réécrit sur place s'y étalait sur autant de lignes qu'elle avait
d'états, et il fallait retirer les ordres de placement avant de le rejouer, faute de quoi
l'effacement d'écran du shell emportait tout ce qui précédait.

Il tient maintenant un émulateur sans affichage, `@xterm/headless`, qui compose ces ordres comme
le ferait un terminal. `@xterm/addon-serialize` rend l'état obtenu sous une forme qui se
réaffiche telle quelle. C'est ce que fait VS Code pour ses terminaux persistants, et ce dont un
courtier détaché aurait besoin de toute façon.

Le coût est réel : chaque octet est analysé deux fois, une fois dans le processus principal et une
fois dans le xterm de l'interface. Pour un terminal, cela ne se sent pas.

Deux détails que l'implémentation ne peut pas ignorer. `Terminal.write` met en file et rend la
main aussitôt : sérialiser sans attendre son rappel rend un écran auquel il manque ce que le pty
vient d'écrire. Et l'écran doit suivre la fenêtre, sans quoi il garderait pour toujours les
dimensions qu'avait l'onglet à sa création — c'est ce que `redimensionner` va chercher.

`@xterm/headless` 6.0.0 annonce enfin un `module` absent du paquet publié, `lib/xterm.mjs`.
Vite préfère ce champ et refuse alors de résoudre le paquet : un alias dans
`electron.vite.config.ts` le mène droit au fichier livré, à retirer le jour où l'amont sera
réparé.

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
npm run dist        # macOS   : dist/Claudex-<version>-arm64.dmg
npm run dist:win    # Windows : dist/Claudex Setup <version>.exe
npm run dist:linux  # Linux   : dist/Claudex-<version>.AppImage et dist/claudex_<version>_amd64.deb
```

On empaquette pour le système sur lequel on se trouve : les trois commandes ne sont pas
interchangeables. Le paquet Debian déclare tmux dans ses dépendances, l'AppImage ne peut rien
déclarer du tout, et l'installateur Windows est un NSIS posé pour l'utilisateur courant. Aucun
des trois n'est signé.

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
node scripts/vitrine.mjs docs                # captures de l'application, décor fabriqué
node scripts/icone.mjs                       # recompose l'icône depuis le logo
CLAUDEX_CAPTURE_PROJETS=~/code/a:~/code/b \
  npm run captures                           # captures sur de vrais projets
npm run capture                              # capture par CDP, sans perturber la fenêtre
npm run demo                                 # regénère docs/demo.gif, la démonstration animée
```

`icone.mjs` compose `build/icon.png` et `docs/logo.png` à partir de
`src/renderer/public/logo.png`, sur fond transparent. Un carré blanc derrière l'icône se voyait
dans le Dock et en tête de la page du dépôt.

`vitrine.mjs` fabrique tout ce qu'il montre — un dépôt jetable dans `/tmp/atelier`, des
conversations inventées, un profil neuf — et remplace l'invite du shell : les captures du
dépôt ne doivent rien devoir à la machine qui les produit. Le README ne porte plus de galerie,
ces captures servent désormais aux notes de version et aux tickets.

`demo.mjs` suit la même règle et va plus loin : trois projets montés dans `/tmp/claudex-demo`,
des conversations écrites pour l'occasion, une invite neutre posée par un `ZDOTDIR` jetable.
La prise passe par l'enregistrement vidéo de Playwright, puis ffmpeg réduit le tout en GIF avec
une palette calculée sur l'ensemble des images. Elle a besoin de ffmpeg.

La démonstration lance un vrai agent et lui fait écrire un vrai fichier : c'est l'outil que
Claudex orchestre, le montrer en peinture n'aurait pas de sens. Elle consomme donc un peu de
quota. La conversation créée est ensuite fermée puis reprise depuis la colonne, ce qui est la
promesse de l'application et ne se joue pas.

**Les encadrés rouges** sont injectés dans la page le temps de la prise et épousent la boîte
réelle de l'élément visé : ils montrent ce qui se passe, ils ne le reconstituent pas.

Il y avait aussi un curseur dessiné, retiré depuis. Une flèche animée par une transition CSS
n'arrive pas toujours avant le clic quand la page redessine un terminal, et l'on voyait alors
l'action se produire avant que la flèche n'ait bougé. Un repère qui ment sur l'ordre des choses
vaut moins que pas de repère du tout.

**Le plan de l'agent est accéléré**, et lui seul. Le facteur suit sa durée réelle plutôt que
d'être fixé une fois pour toutes : l'agent met entre trente et cinquante secondes selon les
jours, et un facteur constant donnait une démonstration de quarante-cinq secondes un jour, de
cinquante-six le lendemain. On vise dix-huit secondes pour ce plan, sans descendre sous deux ni
monter au-delà de quatre. Il dure une trentaine de
secondes en vrai, pendant lesquelles les appels d'outils défilent ; au rythme réel la
démonstration s'étirait au-delà de la minute. Le reste garde sa vitesse, sans quoi les gestes
de souris deviennent illisibles. Rien n'est coupé ni rejoué, seule l'horloge de ce segment est
resserrée, et les bornes sont relevées pendant la prise.

**Ce qui ne bouge pas est resserré à trois dixièmes de seconde**, et le montage le trouve seul.
Une démonstration passe l'essentiel de son temps devant un écran arrêté : sur une prise de
quatre-vingt-deux secondes, **cinquante-deux ne portaient aucun changement**, l'application qui
démarre, Claude Code qui charge, un agent qui réfléchit entre deux outils. Le montage compare
les images dix fois par seconde, relève ces plages et les resserre, sans toucher à ce qui bouge.

Le mouvement du plan de l'agent est le seul à être accéléré, et modérément, à deux fois sa
vitesse : ses appels d'outils défilent et doivent rester lisibles. Accélérer le plan d'un bloc
revenait à hâter aussi ses silences, qui n'en avaient pas besoin.

L'ouverture garde son souffle : une boucle qui démarre sur un plan escamoté ne se lit pas.

**Le GIF est rendu à 25 images par seconde**, la cadence à laquelle Playwright enregistre. En
rendre 11 jetait plus de la moitié du mouvement et le curseur avançait par bonds. La finesse
ne coûte presque rien : une image identique à la précédente se compresse pour rien, si bien
que le fichier passe seulement de 5,6 à 7,6 Mo. C'est aussi pourquoi le plan de l'agent est à
deux et non à trois : à trois il pesait plus lourd, un mouvement haché se compressant moins
bien qu'un mouvement continu.

**La police du terminal est forcée à 20 px** par `window.__claudexPolice`, comme le rendu WebGL
est écarté par `window.__claudexSansWebgl`. À 12,5 px, le texte n'est plus lisible dans un GIF
affiché à mille pixels de large.

Quatre pièges, tous rencontrés. Le serveur tmux du socket `claudex-demo` est abattu en premier :
un pane hérite de l'environnement du serveur et non de celui du client, et les agents de la
prise précédente y vivent encore. On attend ensuite deux secondes, car un agent abattu écrit son
transcrit en s'arrêtant, après le nettoyage. Le décor est enfin vérifié fichier par fichier
avant la prise, plutôt que supposé propre. Et le chemin des projets est résolu : sur macOS
`/tmp` est un lien vers `/private/tmp`, Claude Code range ses transcrits sous le chemin réel
quand Claudex encode le chemin déclaré, si bien que la conversation créée n'arrivait jamais
dans la colonne.

Le dialogue de confiance de Claude Code met « No, exit » en avant : valider sans descendre d'un
cran arrête l'agent aussitôt lancé.

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

**Tout `.ps1` lancé par Claudex a besoin de `-ExecutionPolicy Bypass`.** La politique par défaut
d'un poste Windows refuse d'exécuter un script local. Cela vaut pour le script de hook comme pour
le script d'amorce d'un terminal, et l'oubli sur le second a été livré : le terminal s'ouvrait sur
« l'exécution de scripts est désactivée sur ce système » au lieu d'une invite.

**Et il a fallu le livrer pour le voir, parce que l'environnement de test était plus permissif que
celui de l'utilisateur.** Un terminal ouvert en `-ExecutionPolicy Bypass` pose
`PSExecutionPolicyPreference` dans son environnement, et tout ce qu'il lance en hérite, de proche
en proche : la suite de tests, Electron, le pty, le shell. La politique effective y était donc
`Bypass` alors qu'elle est `Restricted` pour une application ouverte depuis le menu Démarrer.
Les deux suites retirent maintenant cette variable avant de lancer quoi que ce soit — c'est ce qui
fait qu'un test échoue si le drapeau disparaît à nouveau.

La règle générale, apprise là : **une suite qui hérite de l'environnement du développeur ne teste
pas la machine de l'utilisateur.** C'est le deuxième cas de la même famille dans ce dépôt, après
l'écran d'état qui dépendait de la rétention configurée sur la machine de qui lançait les tests.

Reste une limite connue : `-ExecutionPolicy Bypass` ne l'emporte pas sur une politique posée par
stratégie de groupe. Sur un poste d'entreprise verrouillé, les deux scripts échoueraient encore.
Le remède serait de passer par `-EncodedCommand`, à quoi la politique d'exécution ne s'applique
pas puisqu'il n'y a plus de fichier. Personne n'a signalé le cas, et l'échange se paierait en
lisibilité : on ne peut plus lire sur le disque ce qui a été joué.

**`process.env.HOME` n'existe pas.** `os.homedir()` lit `USERPROFILE`. Un test qui forçait
`HOME` pour se donner une maison jetable écrivait en réalité dans le vrai `~/.claude`.

**Un dossier reste verrouillé après le `kill`** d'un processus qui l'avait pour répertoire
courant : `rm` répond `EBUSY`. Les nettoyages de test passent par `maxRetries`.

**`~/.local/bin` n'est pas dans le PATH** juste après l'installation de Claude Code : son
installateur ne l'ajoute qu'à la session Windows suivante. Le pilote ConPTY l'ajoute au PATH des
shells qu'il lance quand `claude.exe` s'y trouve, et l'écran d'état y cherche le binaire avant
de conclure qu'il manque.

**Le serveur tmux hérite des descripteurs d'Electron.** Lancé par l'application, il garde
ouverts ses caches et ses tuyaux de sortie — et il lui survit, donc il les garde longtemps.
Vu sur Debian : un serveur tmux tenait encore le port du débogueur deux heures après la
fermeture de l'application, empêchant toute relance de `npm run dev:debug`. Les tests de bout
en bout mettent pour cette raison le serveur debout eux-mêmes, avant de lancer l'application ;
sans quoi `app.close()` de Playwright attend une fin de flux qui ne vient jamais.

**Ce qui dépend du système passe par `@shared/plateforme` ou un test sur `process.platform`.**
Le renderer est en bac à sable et n'a pas accès à `process` : le pont lui donne la plateforme
de façon synchrone, parce que la barre du haut et les libellés des raccourcis en dépendent dès
le premier rendu.

## Langue

Le code, les commentaires et les messages de commit sont en français. Les commentaires disent
*pourquoi*, pas *quoi* : ce qui a été essayé et n'a pas marché, la contrainte qui a imposé la
forme. Le reste, le code le dit déjà.
