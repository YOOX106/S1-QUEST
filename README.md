# S1-QUEST

S1 QUEST conserve son Dashboard, ses sept modules, la gestion des tâches personnelles, les paramètres et l’export de progression. Cette étape ajoute le **parcours pédagogique d’Analyse 1**, sans backend ni assistant IA.

## Lancer le site

Depuis la racine du projet :

```sh
python3 -m http.server 8000 --bind 127.0.0.1
```

Ouvrir le site sur le port 8000 dans un navigateur moderne. Utiliser un serveur HTTP : le catalogue JSON ne se charge pas de manière fiable avec une ouverture directe `file://`. Aucun build ni dépendance d’exécution n’est nécessaire.

Fichiers nécessaires : `index.html`, `style.css`, `script.js`, `js/curriculum.js` et `curriculum.json`. Les chemins sont relatifs et les routes utilisent le hash, par exemple `#/module/analyse1`.

## Parcours Analyse 1

Le catalogue contient exactement les titres fournis par l’utilisateur :

1. Chapitre I : Nombres réels.
2. Chapitre II : Suites numériques.
3. Chapitre III : Fonctions réelles d'une variable réelle.
4. Chapitre IV : Fonctions dérivables.

La section TD contient **TD Série 1**, **TD Série 2** et **TD Série 3**. Aucun TP d’Analyse 1, sous-chapitre ou contenu d’un autre module n’est inventé. Les sous-parties ne seront affichées que si elles sont identifiées et vérifiées dans un document ; elles restent informatives et ne sont pas comptées en plus du chapitre.

Les chapitres et TD gardent leur ordre pédagogique même lorsqu’ils sont cochés. Un clic sur « Ouvrir le PDF » ouvre le fichier Drive dans un nouvel onglet, sans modifier sa case. Le TD peut être travaillé avant le cours.

Quatre associations sont **proposées et à confirmer**, d’après les observations communiquées : chapitre I → TD 1 ; chapitre II → TD 2 et TD 3 ; chapitre III → TD 3. Le chapitre IV n’a pas d’association proposée. Les boutons conduisent à l’entrée unique du TD, qui n’est jamais comptée plusieurs fois.

Les tentatives d’accès aux sept liens réels ont été bloquées par le proxy réseau de l’environnement (403). Cela ne prouve ni une erreur du lien ni un refus de permission Drive. Les PDF et leurs contenus ne sont donc pas déclarés vérifiés. Aucun partage ni aucune permission n’a été modifié.

## Liens Drive privés et dépôt public

Le fichier versionné `curriculum.json` contient des titres, identifiants, ressources et relations, **sans les URL privées fournies**. Le code et les tests versionnés ne contiennent pas non plus leurs identifiants Drive.

Les sept URL exactes sont préparées pour les essais locaux dans `curriculum.links.local.json`, exclu de Git par `.gitignore`. Ne pas forcer son ajout à Git et ne pas inclure ce fichier dans une publication publique. Aucune publication ou poussée Git n’a été effectuée.

Sur une installation GitHub Pages, ouvrir **Paramètres → Mes liens privés Google Drive** et choisir ce fichier JSON depuis l’ordinateur. Les liens seront conservés dans le navigateur, sous une clé distincte `s1quest_private_links`, et utilisés après rechargement. L’ancien fichier de configuration local reste facultatif. Si aucun lien n’est disponible, le site affiche « PDF à renseigner » plutôt qu’un faux bouton.

Format attendu (sans URL d’exemple inventée) : un objet de version numérique `schemaVersion: 1` et un objet `links` qui associe les IDs de ressources du catalogue aux URL Drive exactes. Les ressources sont `a1-resource-cours-01` à `a1-resource-cours-04`, puis `a1-resource-td-01` à `a1-resource-td-03`.

Tout le fichier est validé avant application. Seuls les liens HTTPS de fichiers sur `drive.google.com` sont acceptés. Cette validation contrôle la structure du lien, jamais les permissions ou le contenu du document. Un fichier invalide ne remplace ni la configuration précédente ni la progression. En cas de quota, les nouveaux liens restent utilisables en mémoire et un avertissement demande de conserver le fichier source.

Les liens importés restent hors du catalogue public, du cache public et de l’export de progression. Les conserver dans ce navigateur ne rend pas publics les fichiers Drive. Leur ouverture continue de dépendre du compte Google et des permissions réelles. Les navigateurs et les autres applications du même domaine partagent la frontière d’origine de localStorage : cette fonction n’est pas un coffre chiffré ni une synchronisation cloud.

## Conservation de la progression

Avant de mettre à jour le site, télécharger un export JSON depuis la version utilisée sur l’adresse habituelle du site.

La clé active reste **`s1quest_data`**. La migration **schemaVersion 1 → 2** conserve les sept modules, les IDs et dates des tâches personnelles, leurs cases cochées, le pseudo, les personnalisations et les autres champs existants. Elle exige une copie brute de secours vérifiée avant remplacement. Une erreur de quota, une sauvegarde invalide ou un conflit n’entraîne jamais une réinitialisation automatique. En cas d’écriture non vérifiable, une alerte indique que l’enregistrement n’est pas confirmé et la copie brute précédente est conservée.

Le contenu académique reste dans le catalogue. La progression du catalogue est stockée séparément dans `curriculumProgress`, référencée par IDs stables. Le chargement est une projection : il ne pousse pas de nouvelles tâches à chaque visite. Recharger ou réimporter la même version ne crée pas de doublons. Les états des éléments absents d’un nouveau catalogue restent conservés ; ils ne sont pas effacés.

Les tâches personnelles déjà présentes ne sont jamais fusionnées sur la seule égalité des titres. Le bouton **Rattacher une tâche existante** permet un rapprochement explicite, dans la même section : il réutilise la case, l’ID et les dates de la tâche choisie et la compte une seule fois. Détacher conserve la tâche personnelle et la progression copiée ; elles redeviennent des entrées distinctes.

Un élément du catalogue peut être **masqué**, puis réaffiché avec sa progression depuis « Éléments masqués ». Un rechargement ne le recrée pas automatiquement. Les titres personnalisés restent des préférences utilisateur et ne changent pas le titre source du catalogue.

Le catalogue public validé dispose d’un cache distinct. Si le fichier est indisponible, le site tente ce cache et le signale. Sans catalogue ni cache utilisable, les tâches personnelles restent disponibles et le bandeau précise que les pourcentages affichés sont partiels. Le cache ne remplace pas la sauvegarde de progression.

localStorage est propre au navigateur et à l’origine du site. Changer de domaine, de protocole ou de port ne transfère pas les données. Ne pas changer l’adresse de publication pour cette mise à jour sans préparer leur transfert. L’export des données n’inclut pas les liens privés ; l’import de sauvegardes de progression n’est pas ajouté dans cette étape.

## Calculs et réinitialisation

Cours et TD ont des cases et pourcentages indépendants. Les progressions du module et du semestre sont pondérées par les unités réellement affichées, y compris les tâches personnelles conservées ; les recommandations et sous-parties informatives n’ajoutent aucune unité. L’arrondi est appliqué uniquement à l’affichage et le reste est son complément exact à 100 %.

Les autres modules restent à configurer lorsqu’ils n’ont aucune tâche. Les sept IDs, leurs sections et l’ordre des modules restent fixes. La réinitialisation conserve les deux confirmations et une copie de secours obligatoire : elle efface les données personnelles et les cases du catalogue, pas les titres académiques ni les liens privés conservés séparément.

## Tests

Tests de logique et de migration, sans dépendance :

```sh
node --test tests/core.test.cjs tests/migration.test.cjs tests/curriculum.test.cjs
```

Tests navigateur avec Playwright accessible à Node et Chromium installé :

```sh
node --test tests/browser.cjs
```

La suite navigateur lance son serveur temporaire et utilise des contextes isolés. `CHROMIUM_PATH` permet d’indiquer un autre chemin que `/usr/bin/chromium`. Les liens externes et fenêtres de PDF sont simulés dans la suite ; ils ne prouvent pas l’accès aux vrais documents.

Voir [TESTS.md](./TESTS.md) pour les résultats réels, leurs preuves et les limites restantes.

## GitHub Pages

Le site conserve son déploiement statique : branche choisie dans **Settings → Pages**, dossier racine, sans build ni fichier `.nojekyll`. Publier seulement les fichiers publics nécessaires, dont le dossier `js/` et `curriculum.json`. Les liens privés restent exclus et sont chargés depuis Paramètres sur chaque navigateur autorisé.

Cette intervention ne publie rien, ne déploie aucun backend, n’indexe aucun PDF et n’effectue aucun appel à une API IA. L’étape suivante attendra la validation du parcours sur les documents réels.
