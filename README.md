# S1 QUEST

Application statique de révision S1 MI, JavaScript natif, compatible GitHub Pages. Le site existant est conservé et enrichi par les phases **A et B** : catalogue fourni de 454 micro-missions, suivi personnel, révisions et sources privées associées localement. Aucun backend, appel IA, service payant ou déploiement n’est activé.

## Prévisualiser sur son ordinateur

Récupérer la branche de travail et ouvrir son dossier dans un terminal :

```sh
git switch feature/s1-quest-study-rpg
python3 -m http.server 8000 --bind 127.0.0.1
```

Dans **le navigateur du même ordinateur**, saisir `http://127.0.0.1:8000`. Sous Windows, utiliser `py -m http.server 8000 --bind 127.0.0.1` si nécessaire. Pour un dossier téléchargé sans Git, lancer simplement la commande Python à sa racine. Ne pas ouvrir `index.html` en `file://` : le catalogue est chargé par HTTP.

Le serveur du cloud Codex n’est pas automatiquement accessible depuis votre PC. Aucun aperçu interactif externe n’est fourni par cet environnement. Les captures et les tests Chromium attestent uniquement des essais locaux.

Aucun build ni dépendance d’exécution. Conserver ensemble `index.html`, `style.css`, `script.js`, `curriculum.json`, `js/curriculum.js` et `js/microcurriculum.js`. Les chemins relatifs et les routes hash (`#/module/analyse1`) fonctionnent aussi sous `/S1-QUEST/`.

## Parcours livré

- Sept modules fixes ; six documentés, Méthodologie **À configurer**, sans programme inventé.
- Module → Cours/TD/TP autorisés → chapitre/série → petite mission ou exercice. Parents repliables, cinq unités affichées d’abord, puis « Voir plus » ; ordre source conservé.
- Cases « Terminé », démarrage et compréhension distincts : inconnue, À revoir, Compris, Maîtrisé. Ouvrir un PDF ou choisir Maîtrisé ne coche rien.
- Pourcentages Cours, TD, TP, groupe, module et semestre pondérés par les feuilles uniques. Par défaut **437 unités d’objectif et 17 bonus**, hors tâches personnelles. Les bonus peuvent être inclus explicitement dans l’objectif personnel.
- Recherche, filtres, prochaine mission déterministe, pages Révisions et Ressources, tâches personnelles et personnalisations conservées.
- 24 associations Cours–TD **proposées**, jamais confirmées automatiquement. Les TD restent accessibles avant le cours et ne sont pas dupliqués par les recommandations.

Le JSON joint est conservé à l’identique dans `curriculum.json`. Ses 66 références correspondent à 63 couples module/nom de fichier distincts. Ce catalogue préparatoire n’est pas une certification du programme officiel. Les intitulés et niveaux de confiance proviennent du document fourni ; les PDF n’ont pas été réinspectés ici. Voir [la validation académique](docs/validation-academique.md).

## Protection des données et migration

**Avant toute mise à jour du site habituel : exporter sa sauvegarde JSON.** localStorage dépend du navigateur, du domaine et du port. Les données de votre navigateur sur GitHub Pages ne sont pas accessibles depuis cette copie cloud.

La clé active reste `s1quest_data`. Le site antérieur de cet environnement utilisait déjà le schéma 2 ; cette étape utilise donc le **schéma 3**, avec migration depuis 1 ou 2. Une copie brute horodatée `s1quest_backup_*` est écrite et relue avant toute migration ou import remplaçant les données. Version inconnue, corruption, quota et conflit ne déclenchent jamais de remise à zéro automatique. Un échec de persistance est signalé ; exporter alors les changements en mémoire avant de fermer la page.

Le programme reste séparé de la progression :

- `curriculumProgress` conserve les anciens chapitres/séries, leurs validations, masquages, titres et liaisons.
- `unitProgress` contient les états des nouvelles feuilles par ID canonique stable.
- Les anciennes validations de chapitres **ne valident pas leurs enfants automatiquement**. L’historique est affiché dans le groupe. Un ancien parent masqué garde ses enfants hors objectif jusqu’à restauration explicite.
- Une tâche personnelle anciennement liée à un parent reste visible comme historique hors calcul, pour éviter le double compte avec les nouvelles feuilles. On peut la rattacher explicitement à une feuille.
- Aucun rapprochement par titre n’est automatique. Une liaison explicite et réversible réutilise l’ID et les dates de la tâche personnelle et ne la compte qu’une fois.
- Charger dix fois le catalogue n’insère aucune nouvelle tâche dans la sauvegarde. Les états d’IDs momentanément absents restent conservés.

**Paramètres → Sauvegarde JSON** exporte la progression et permet un import validé, avec aperçu et saisie obligatoire `IMPORTER` avant remplacement. L’import remplace la progression, il ne fusionne pas deux sauvegardes. La réinitialisation conserve ses deux confirmations et exige elle aussi une copie de secours vérifiée. Les autres applications ne sont jamais effacées.

Pour récupérer une copie brute locale : dans les outils du navigateur, rubrique Stockage local, retrouver une clé `s1quest_backup_*`, copier sa valeur dans un fichier JSON puis l’importer via Paramètres. Garder aussi un export sur disque ; les copies locales peuvent disparaître avec les données du navigateur.

## PDF et confidentialité

Le catalogue public n’embarque **aucune URL Drive privée, aucun identifiant Drive privé ni PDF**. Les PDF restent privés et les permissions Google Drive ne sont jamais modifiées. Les titres et noms de fichiers du catalogue fourni sont visibles dans le dépôt public.

« Associer un PDF » enregistre un lien Google Drive autorisé sur cet appareil, sous la clé distincte `s1quest_private_links`. Cette association contrôle la syntaxe HTTPS du lien, **pas son accès effectif**. Le document s’ouvre dans un nouvel onglet si votre compte Google possède les droits. Le lien privé reste exclu du cache public et de l’export de progression. localStorage partage la frontière du domaine ; ce n’est pas un coffre chiffré.

Les sept liens Analyse 1 déjà fournis sont disponibles uniquement dans `curriculum.links.local.json`, ignoré par Git. Ne jamais forcer son ajout ou le publier. Sur GitHub Pages, importer ce JSON depuis **Paramètres → Mes liens privés Google Drive**. Format : `schemaVersion: 1`, puis `links`, objet associant les IDs des ressources à leurs vrais liens. Les IDs Analyse 1 restent `a1-resource-cours-01` à `04` et `a1-resource-td-01` à `03`. Les autres sont consultables dans Ressources et résolus depuis `source_id` par `js/microcurriculum.js`.

Aucun accès réel aux PDF n’est garanti par les tests : les tentatives précédentes dans ce cloud ont rencontré un refus du proxy (403). Les tests de liens utilisent des documents factices interceptés, jamais les PDF privés. Aucune synchronisation Drive automatique n’est annoncée.

## Tests

Node 20 ou plus récent pour la logique :

```sh
node --test tests/core.test.cjs tests/migration.test.cjs tests/curriculum.test.cjs tests/microcurriculum.test.cjs
```

Les tests du catalogue antérieur utilisent `data/curriculum-legacy.json` pour vérifier la compatibilité ; les tests `microcurriculum` portent sur le catalogue courant.

Avec Playwright et Chromium installés pour les essais navigateur :

```sh
node --test tests/browser.cjs tests/microbrowser.cjs
```

`CHROMIUM_PATH` permet de choisir l’exécutable (défaut `/usr/bin/chromium`). Les serveurs de test utilisent un port temporaire, refusent le véritable fichier privé et n’appellent aucun service IA. Sur une nouvelle machine, installer Playwright uniquement pour développer/tester ; le site fonctionne sans ce paquet. Le schéma JSON peut être contrôlé avec Python `jsonschema`, facultatif et distinct de la validation JavaScript exécutée par le site.

Résultats réellement exécutés : [TESTS.md](TESTS.md). Livraison et fichiers : [docs/phase-b-livraison.md](docs/phase-b-livraison.md).

## Suite du projet

La phase C ajoutera XP/rangs/succès et mini-quêtes après validation de ce socle. La phase D sera une démonstration IA clairement signalée. La phase E réelle nécessite un accord distinct pour les documents autorisés, l’authentification, les coûts, l’indexation et le déploiement. Aucune clé API ne doit être ajoutée au frontend. Rien n’a été poussé, fusionné dans `main` ou publié par cette intervention.
