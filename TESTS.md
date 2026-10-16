# Résultats réellement exécutés — S1 QUEST

## Phase A : référence préservée

Le 16 octobre 2026, avant import des micro-missions : **67 PASS / 0 FAIL**, dont 49 tests de logique et 18 scénarios Chromium (environ 15,3 s). Détails : [audit Phase A](docs/phase-a-audit.md).

## Phase B : vérification finale

Commande exécutée sur le code livré :

```sh
node --test tests/core.test.cjs tests/migration.test.cjs tests/curriculum.test.cjs tests/microcurriculum.test.cjs tests/browser.cjs tests/microbrowser.cjs
```

**PASS : 112 tests ; FAIL : 0 ; ignorés : 0 ; annulés : 0.** Durée : 25,24 secondes. Node 24.19.0, Playwright et Chromium système, 16 octobre 2026. Journal local : `/tmp/s1quest-phase-b-tests-final.log` ; la suite ne dépend pas de ce journal pour être relancée.

| Suite | Exécutés | Résultat | Vérifications principales |
| --- | ---: | --- | --- |
| `core.test.cjs` | 24 | PASS | Modules, calculs pondérés/arrondis, tâches personnelles, stockage, reset protégé |
| `migration.test.cjs` | 9 | PASS | Conversion v1→3, sauvegarde brute vérifiée, quota, corruption, concurrence |
| `curriculum.test.cjs` | 16 | PASS | Compatibilité du catalogue antérieur et historique, liens/liaisons sûrs |
| `microcurriculum.test.cjs` | 30 | PASS | 454 feuilles, IDs, sources, ordre, bonus, indépendance des états, migration v2, import, filtres et absence de doublons |
| `browser.cjs` | 18 | PASS | Régressions des interactions existantes adaptées aux feuilles ; brouillons, modales et courses asynchrones |
| `microbrowser.cjs` | 15 | PASS | Parcours réel, états, Cours→TD, ressources locales, import confirmé, corruption/quota/conflit, mobile/clavier et base GitHub Pages |

Les 18 scénarios navigateur antérieurs ont été conservés et adaptés au nouveau catalogue ; le CRUD personnel cible explicitement les tâches personnelles. Les 16 tests du catalogue historique s’appuient sur `data/curriculum-legacy.json`, tandis que les 30 nouveaux tests utilisent le catalogue courant. Ce ne sont pas 112 examens de documents académiques.

## Contrôles supplémentaires exécutés

- **PASS** : syntaxe JavaScript (`node --check script.js`, helpers et suites).
- **PASS** : `git diff --check`.
- **PASS** : JSON Schema Draft 2020-12 valide ; catalogue fourni conforme avec Python `jsonschema`. Six exemples invalides refusés et extension à 455 feuilles acceptée lors de la vérification du schéma.
- **PASS** : `curriculum.json` identique octet par octet au fichier utilisateur. SHA256 : `77f6c63345297ba54e106eb9ee0f289ad09d287ba787f1c372ef0bf3bdb8986b`.
- **PASS** : les sept véritables identifiants Drive locaux sont absents des fichiers publics candidats ; fichier de liens ignoré par Git ; aucun PDF versionné.
- **PASS** : serveur local port 8000, requête HTTP 200 sur `index.html`, chargement du Dashboard et du module Analyse 1 dans Chromium.
- **PASS** : captures réelles ordinateur/mobile, sans liens privés chargés ; inspection visuelle du Dashboard, d’Analyse 1 et du viewport mobile.
- **PASS** : chargement des assets relatifs et rechargement d’une route sous `/S1-QUEST/`, sur serveur de test simulant ce chemin ; ce n’est pas un déploiement GitHub Pages.

Observation indicative de performance sur cette machine : Dashboard prêt en 624 ms ; Analyse 1 rend initialement 10 feuilles et 494 éléments DOM. Les autres feuilles sont accessibles par accordéons et « Voir plus ». Ce relevé isolé n’est pas un benchmark multi-appareils ni une garantie de délai.

## Limites et contrôles non exécutés

| Vérification | Statut | Limite |
| --- | --- | --- |
| Ouverture des vrais PDF Drive | NON VÉRIFIÉE | Les tentatives antérieures ont rencontré le proxy 403 ; les fenêtres PDF des tests utilisent des liens factices interceptés. |
| Validation académique des 454 contenus dans les PDF | NON EXÉCUTÉE | Le catalogue et ses niveaux de confiance ont été intégrés tels que fournis ; voir les réserves académiques. |
| Données du navigateur personnel sur le site publié | NON ACCESSIBLES | Les migrations sont testées sur des sauvegardes représentatives isolées ; exporter les données réelles avant mise à jour. |
| Safari, Firefox, appareil physique et lecteur d’écran | NON EXÉCUTÉ | Tests Chromium ordinateur/mobile, clavier et contrôles de focus seulement ; pas de certification complète WCAG. |
| Audit automatique complet de contraste WCAG | NON EXÉCUTÉ | Style sombre et focus conservés, inspection visuelle réalisée. |
| XP, quêtes et succès Phase C | NON EXÉCUTÉS | Non implémentés dans les phases A/B. |
| IA, OCR, indexation, authentification backend | NON EXÉCUTÉS | Phases ultérieures, aucun service externe activé. |
| Déploiement et fusion dans `main` | NON EXÉCUTÉS | Soumis à une autorisation distincte. |

Les tests ne modifient ni les permissions Drive ni un compte externe. Chaque contexte navigateur est isolé. Le serveur de test refuse explicitement le fichier de liens privé avant toute lecture.

## Contrôle avant envoi GitHub

Sur demande explicite ultérieure, les mêmes 112 tests ont été relancés : **112 PASS, 0 FAIL, 0 ignoré**, 24,31 s. La branche de travail a ensuite été poussée. La création automatique de PR est bloquée par le proxy vers l’API GitHub ; aucun déploiement ni fusion n’a eu lieu. Voir [publication-github.md](docs/publication-github.md).
