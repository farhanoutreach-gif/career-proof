# Career Proof

Career operating system built around a persistent Career Profile. See `CLAUDE.md` for product principles, data model, and build sequence.

## Develop

```bash
npm install
npm run dev
```

Open http://localhost:3000.

## Deploy

Vercel, connected to this GitHub repo — every push to `main` deploys.

## O*NET data

Target career requirements come from the official O*NET database (CC BY 4.0), never typed by hand.
To regenerate `data/onet/<soc>.json` and the `0004_onet_*.sql` migration:

```bash
# download the CSVs from https://www.onetcenter.org/dl_files/database/db_31_0_csv/ into an empty folder
node scripts/import-onet.mjs <folder> 15-2051.01 31.0
```

The importer fails if any file or column name differs from what it expects.
