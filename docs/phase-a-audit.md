# Phase A — audit et sauvegarde

Le 16 octobre 2026, les trois pièces jointes ont été lues intégralement avant développement. La demande actuelle autorise explicitement le développement sur une branche dédiée ; elle prévaut sur la phrase antérieure demandant validation avant modification. Le Master Prompt gouverne le produit, le catalogue et les consignes annexes gouvernent les données et leurs limites.

- Référence distante inspectée : main, `96aaebcbe56b39a1ca0a8a24a774f4684321112a`.
- Écart local préservé : parcours Analyse 1 précédent, fichiers JS/CSS/HTML modifiés, catalogue à sept parents, helper et 67 tests, README et import local de liens privés. Ce travail n’avait pas encore été commité.
- Le stockage local est déjà en version 2, contrairement à la base v1 décrite dans le Master Prompt. Une évolution technique sera donc versionnée sans remplacer ni effacer les anciennes données.
- Branche : `feature/s1-quest-study-rpg`. Aucun worktree, reset, fusion, push ou déploiement.
- Sauvegarde privée complète et vérifiée avant modification : `/tmp/s1quest-phase-a-before.tar.gz` (inclut les fichiers ignorés et les métadonnées Git ; ne pas publier cette archive).
- SHA256 de cette archive : `b014e3c62e45d12297485f06ff328ae90c2a3b68e0e9645181ff5f3fcaa6a6c8`.
- Le catalogue précédent, dépourvu d’URL privées, est conservé dans `data/curriculum-legacy.json` pour les régressions et la lecture des anciennes validations.

Commande de référence exécutée avant la Phase B :

```sh
node --test tests/core.test.cjs tests/migration.test.cjs tests/curriculum.test.cjs tests/browser.cjs
```

Résultat réel : **67 PASS, 0 FAIL**, dont 49 tests unitaires et 18 scénarios Chromium, environ 15,3 secondes. Cette exécution valide l’existant, pas les fonctionnalités futures.

Le catalogue fourni contient exactement 454 feuilles, 66 références source représentant 63 couples module/nom de fichier, 24 associations proposées et sept modules. Méthodologie est vide. Les 7 exercices explicitement facultatifs et le groupe informatique `tpbonus` de 10 unités demandent une distinction entre pourcentage obligatoire et bonus. Les divergences et limites académiques seront documentées sans correction silencieuse du fichier source.

Aucun accès au stockage du navigateur réel de l’étudiant n’est possible depuis les tests : les garanties sont vérifiées sur des sauvegardes représentatives isolées. Exporter les données depuis l’adresse habituelle du site avant une future mise à jour publiée. L’ouverture réelle des PDF, précédemment bloquée par le proxy, n’est pas présentée comme vérifiée.
