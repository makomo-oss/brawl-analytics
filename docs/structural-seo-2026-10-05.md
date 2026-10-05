# Structure-based SEO

The existing statistics now have crawlable mode and map URLs. No explanatory SEO sections were added to the app.

- `/modes` links to the eight primary modes; `/maps` lists maps with sufficient samples in at least one cohort. The initial local snapshot generates 71 map URLs.
- `/modes/brawl-ball` and `/maps/center-stage` are representative detail routes. Each contains the actual character ranking, win rate, use rate, sample count and update date in the first HTML response. Both cohorts use their own statistics.
- Tier links to both hubs. Mode pages link to matching maps; maps link back to their modes. Ranking rows link to character pages, whose existing mode/map labels now link back to these routes.
- Canonical paths combine global/ranked cohorts rather than creating URLs for every filter combination. BreadcrumbList, CollectionPage and ItemList describe visible navigation and the default ranking. Insufficient samples are not numbered as ranked characters.
- The sitemap includes sufficiently sampled snapshot routes and their source update timestamps. Build preparation now preserves each context's own `updated_at`; old local snapshots fall back to the cohort timestamp.
- New pages use the existing Pages runtime, bounded API requests, immediate build snapshots, five-minute refresh and stale responses during outages. Statistics refresh server-side without requiring a rebuild. New map detail URLs can resolve from live API categories; the map hub and its sitemap inventory use the eligible build snapshot. Existing new-character discovery and sitemap updates remain live.
- Document links cross the Next/Pages runtime boundary directly, avoiding an RSC navigation request to a document endpoint. Internal JSON snapshots are excluded from crawler access in robots.txt.

Validation: production build, Worker TypeScript and new-file ESLint; `test:condition-pages`, `test:live-brawlers`, and snapshot preparation tests. Coverage includes canonical and unique paths, cohort separation, JSON-LD order matching visible rows, low-sample exclusion, sitemap entries, cold/stale responses independent of slow APIs, live refresh, newly observed map URLs, missing routes, HEAD, redirects and rejected methods. Browser checks include global/ranked switching, navigation and a 390-pixel viewport without document overflow.

This changes discovery and information architecture. Search indexing and rankings remain external outcomes, not test results.
