# LogiMeet

Petit outil privé façon Doodle / Framadate pour trouver un créneau qui convient à
toute l'équipe - **timezone-aware**.

- **Page d'accueil** : bouton pour créer un sondage (titre, plage de dates, granularité
  des créneaux, plage horaire, liste de participants).
- **URL admin** (secrète) : générée à la création ; permet de gérer les participants et
  de copier le **lien individuel** de chacun.
- **Lien participant** : vue calendrier « semaine » sur laquelle on **peint** ses
  disponibilités au drag (vide = pas dispo, rempli = dispo).
- **Fuseaux horaires** : chaque personne saisit dans son fuseau local (affiché en haut).
  Les dispos sont stockées en instants absolus (UTC) et re-affichées dans le fuseau de
  celui qui regarde - le décalage est automatique.
- **Résultats** : tous ceux qui ont un lien voient les réponses agrégées, listées du
  créneau **le plus proche au plus lointain**, filtrables par nombre de participants.

## Stack

Next.js (App Router, TypeScript) · Mantine (UI) · Prisma + SQLite · Luxon (timezone).
Une seule app, un seul déploiement.

## Développement

```bash
npm install
npx prisma migrate dev   # crée la base SQLite locale (prisma/dev.db)
npm run dev              # http://localhost:3000
```

## Production (Docker)

La base SQLite est persistée dans un volume monté sur `/data`.

```bash
docker compose up -d --build
```

L'app écoute sur le port `3000`. Les migrations sont appliquées automatiquement au
démarrage du conteneur.

## Modèle de données

- `Poll` : titre, dates min/max, granularité (min), plage horaire (heures locales),
  `adminToken` secret.
- `Participant` : nom, `token` secret (= son lien).
- `Slot` : un créneau disponible, stocké comme instant UTC (`startUtc`).

## Note sur les fuseaux

Le matching des créneaux se fait sur les instants absolus. Il est exact pour tous les
fuseaux à décalage d'heure entière (France, Chine, etc.). Les fuseaux à décalage d'une
demi-heure (Inde, etc.) peuvent ne pas s'aligner parfaitement sur la grille commune.
