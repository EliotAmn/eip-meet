# LogiMeet

Outil d'équipe pour planifier des réunions sans remplir un sondage à chaque fois,
timezone-aware.

## Principe

- **Chaque compte a un calendrier long terme d'indisponibilités** (vue principale) :
  « Indisponible » ou « Si besoin (à éviter) », ponctuelles ou récurrentes (tous les
  jours / semaines / mois, jours de la semaine, intervalle, date de fin). Une occurrence
  se modifie ou se supprime comme dans Apple Calendar : *cet événement / celui-ci et les
  suivants / tous*. Tout ce qui n'est pas indisponible est considéré comme disponible.
- **Réunion** = une période (date min → max) + des **membres** (comptes, invités par
  email) + des **invités sans compte** (lien personnel `/g/…`).
  - Les dispos des membres sont **calculées depuis leur calendrier** : rien à remplir.
  - Les invités peignent leurs dispos (« Dispo » / « Si besoin ») sur la période.
  - Les réunions apparaissent en bandeau sur la période dans le calendrier perso.
- **Résultats** : un liseré par créneau (🟢 tout le monde · 🟡 tout le monde dont « si
  besoin » · 🟠 il manque 1 personne · 🔴 il en manque plus), le détail par personne au
  survol (avec l'heure locale de chacun), et la liste des créneaux possibles.
- **Droits** : le créateur est admin ; il peut nommer d'autres admins. Les admins gèrent
  les paramètres, les membres et les invités ; seul le créateur supprime la réunion.
- **Fuseaux** : le calendrier est saisi dans le fuseau du compte (menu utilisateur) ; tout
  est stocké en instants absolus et réaffiché dans le fuseau de celui qui regarde.

## Stack

Next.js (App Router, TypeScript) · Mantine · FullCalendar (calendrier perso) ·
Auth.js (Google / Microsoft Entra ID) · Prisma + SQLite · Luxon.

## Développement

```bash
npm install
cp .env.example .env        # puis renseigner AUTH_SECRET et les credentials OAuth
npx prisma migrate deploy   # crée / met à jour la base SQLite locale
npm run dev                 # http://localhost:3000
```

Callbacks OAuth à déclarer :
`https://<domaine>/api/auth/callback/microsoft-entra-id` et
`https://<domaine>/api/auth/callback/google` (en local : `http://localhost:3000/...`).

## Production (Docker)

```bash
docker compose up -d --build
```

La base SQLite est dans le volume monté sur `/data` ; les migrations sont appliquées au
démarrage. Les variables `AUTH_*`, `MICROSOFT_*`, `GOOGLE_*` sont lues depuis `.env`.

## Code

- `src/lib/recurrence.ts` : expansion des indisponibilités récurrentes (exceptions,
  changements d'heure).
- `src/lib/server.ts` : droits d'accès aux réunions, calcul des intervalles occupés.
- `src/lib/availability.ts` : statuts par créneau et plages de créneaux possibles.
- `src/app/(app)/` : pages connectées (calendrier, réunions) ; `src/app/g/` : invités.
