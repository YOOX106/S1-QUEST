# Vérification du parcours pédagogique d’Analyse 1

Résultat observé sur les fichiers actuels : **67 tests réussis, 0 échec**.

## Exécution

```bash
node --test tests/core.test.cjs tests/migration.test.cjs tests/curriculum.test.cjs
node --test tests/browser.cjs
```

Les 49 tests unitaires utilisent uniquement les modules intégrés de Node.js. Les 18 scénarios navigateur utilisent Playwright et Chromium, disponibles dans l’environnement de développement. Ils démarrent et arrêtent leur propre serveur HTTP local ; aucun serveur externe n’est nécessaire. Le chemin Chromium peut être adapté avec la variable `CHROMIUM_PATH`.

Playwright est une dépendance de vérification, pas une dépendance du site publié. Aucun backend IA ni appel payant n’a été utilisé.

## Résultats

| Fichier | Tests réussis | Vérifications principales |
| --- | ---: | --- |
| `tests/core.test.cjs` | 24 | Régressions des tâches personnelles, identifiants, dates, calculs pondérés, arrondis, personnalisation, exportabilité, stockage corrompu/indisponible, quotas, conflits et sauvegarde avant réinitialisation |
| `tests/migration.test.cjs` | 9 | Conversion v1→v2 sans mutation de la source ; conservation intégrale des tâches, dates, IDs et personnalisations ; copie brute relue avant remplacement ; chargements répétés ; échecs de copie, d’écriture et de vérification ; conflit entre onglets ; versions invalides/futures |
| `tests/curriculum.test.cjs` | 16 | Quatre chapitres et trois séries exacts ; ordre pédagogique ; aucune sous-partie inventée ; import répété sans doublon ni écriture du catalogue dans la progression ; Cours et TD indépendants ; relation multiple sans double comptage ; conservation et rattachement explicite des tâches personnelles ; masquage et titres personnalisés persistants ; validation du catalogue et des URL |
| `tests/browser.cjs` | 18 | Régressions de l’interface existante, formulaires, navigation, paramètres, export, double confirmation, avertissements et clavier ; parcours Analyse 1, liens PDF, recommandations, progression, rechargements, migration, rattachement, masquage/restauration, viewport mobile, chargement retardé du catalogue, import privé dans le navigateur et priorité du dernier import sur un ancien chargement en attente |

Les tests Cours/TD vérifient notamment :

- 1 chapitre terminé sur 4 : **25 %** pour Cours.
- 1 série terminée sur 3 : **33,33 %** pour TD.
- Total du module : 2 éléments terminés sur 7, sans recompter une série recommandée sous plusieurs chapitres.
- Accès et validation d’un TD avant la validation du cours.
- Conservation de l’ordre des quatre chapitres après validation et après trois rechargements.

Les anciens contenus personnels ne sont pas fusionnés par titre. Le scénario de rattachement explicite vérifie qu’une tâche existante conserve son identifiant, ses dates et sa case cochée, tout en étant comptée une seule fois.

Le chargement retardé du catalogue est testé pendant la modification d’une tâche : la modale, le titre non soumis et le focus restent en place. L’import JSON des liens privés dans Paramètres est testé avec conservation après rechargement, absence de changement de progression et rejet atomique des JSON illisibles, des valeurs `null` ou tableaux, des URL dangereuses et des identifiants de ressources inconnus. Un scénario retarde la réponse d’un ancien fichier de liens jusqu’après un nouvel import explicite : les liens affichés et stockés restent ceux du dernier choix utilisateur.

## Liens Drive : portée exacte des contrôles

Les tests navigateur utilisent des URL Drive fictives **uniquement comme fixtures de test**, injectées dans un complément local simulé. Ils vérifient l’association entre chaque ressource et son lien, l’ouverture dans un nouvel onglet, les attributs `noopener noreferrer`, l’absence de modification de progression à l’ouverture et le rejet intégral d’un complément contenant un lien invalide. Le contenu distant est simulé : ces tests ne prouvent pas l’accès aux vrais PDF.

Un contrôle local séparé a vérifié que les **sept liens réels** du complément privé correspondent exactement aux sept associations titre/document fournies par l’utilisateur et respectent le format HTTPS Google Drive. Ces liens ne figurent pas dans les fixtures versionnées.

L’accès réel aux PDF Google Drive n’est **pas validé**. Les permissions et le contenu doivent être contrôlés avec le compte Google autorisé. Les associations Cours–TD restent donc affichées comme propositions à confirmer ; aucune source ni page de PDF n’est présentée comme vérifiée.

Les tests confirment également que les liens du complément privé, qu’ils proviennent du fichier local ou de l’import dans Paramètres, ne sont copiés ni dans le cache du catalogue public ni dans l’export JSON de progression. Le catalogue versionné ne contient aucune URL Drive privée.

## Limites restantes

- L’ordre des titres provient de l’inventaire utilisateur, pas d’une lecture réussie des PDF dans cet environnement.
- Les sous-parties et correspondances pédagogiques définitives demandent une lecture des documents réels.
- Les scénarios sont passés dans Chromium, dont un viewport mobile de 390 × 844. Safari, Firefox, smartphone physique et lecteur d’écran restent à vérifier.
- Aucune publication GitHub Pages, modification de permissions Drive ou intégration IA n’a été réalisée pour ces tests.

Le serveur du harnais navigateur s’arrête automatiquement après la suite. Ses données et les téléchargements de test utilisent des contextes de navigateur isolés, sans accès à la progression d’un utilisateur réel.
