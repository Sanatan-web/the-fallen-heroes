# The Fallen Heroes

A memorial map of Indian service members who died in the line of duty, placed at the towns and
districts they came from. Static site: two pages, JSON data, no backend.

- `/` entry page
- `/map` the interactive memorial map

Live at https://thefallenheroes.in

## Structure

```
index.html            entry page
map/index.html        the map (served at /map)
css/entry.css         entry page styles
css/map.css           map styles
js/entry.js           enter-site transition
js/map.js             map, markers, drawer, profile, search, About
data/soldiers.json    the researched dataset, exactly as delivered
data/enrichments.json verified additions merged by id (extra sources, notes, pronoun)
data/portraits.json   manifest of locally stored portraits (written by tools/fetch-portraits.mjs)
data/geo/             India outline, state lines and state label points
assets/               background.png, logo.png, og.jpg, favicon.svg, apple-touch-icon.png
assets/soldiers/      portrait files, once fetched
tools/fetch-portraits.mjs  downloads portraits named in the dataset
vercel.json, netlify.toml, robots.txt, sitemap.xml, .nojekyll
```

## Deploying

The site is plain static files; nothing needs building.

- **Vercel**: import the repository, framework preset "Other", build command empty, output
  directory `.`. `vercel.json` turns on clean URLs, so `/map` works and refreshes correctly.
- **Netlify**: build command empty, publish directory `.` (`netlify.toml` included).
- **GitHub Pages**: push the folder to the branch you publish; `.nojekyll` is included so the
  `data/` and `assets/` folders are served as-is.
- **Any other static host**: upload the folder as the site root.

Paths are relative, so the site also works from a sub-folder. Set the domain to
`thefallenheroes.in`; the canonical, sitemap and social tags already point there.

To preview locally, serve the folder (the map fetches JSON, which browsers block on `file://`):

```bash
python3 -m http.server 8000     # then open http://localhost:8000
```

## The data

`data/soldiers.json` is the source of truth and is used exactly as delivered:
`{ "soldiers": [ ... ] }` with `full_name`, `rank_at_death`, `award`, `regiment`, `unit`,
`conflict`, `operation`, `birthplace`, `mapping`, `short_biography`, `act_of_valor`,
`image_source`, `video_sources`, `sources`, `verification`.

`js/map.js` normalises those records for display only. It never rewrites facts, coordinates or
links, and never invents a value.

- **Mapping**: markers use `mapping.mapped_latitude/longitude` as given. `mapping.type`
  `district_headquarters` is shown as such: the profile prints the documented birthplace and,
  below it, "Shown on the map at <mapped_name>." A record without usable coordinates stays in
  the file but cannot be mapped.
- **Portraits**: `image_source.url` is used when present; `data/portraits.json` takes
  precedence if the image has been downloaded locally. If neither loads, the list shows a
  monogram and the profile omits the image. No portrait is ever substituted.
- **Sources and media**: links are used as delivered. Empty `video_sources` shows
  "Media unavailable."
- **Scope**: records with `died_in_service`/`posthumous` set to false are kept in the file but
  not mapped, since this archive remembers those who died in service.
- **About panel**: the count and the list of awards are derived from the data, never hard-coded.
- **verification** is kept in the data and never shown in the interface.

`data/enrichments.json` holds additions checked against their linked sources (extra source
links, notes where sources disagree, the pronoun used for the story heading). It never
overrides anything in `soldiers.json`.

### Adding portraits

```bash
node tools/fetch-portraits.mjs
```

Downloads each record's `image_source.url` into `assets/soldiers/<id>.<ext>` and writes
`data/portraits.json`. Only add images whose licence permits reuse, and keep the source in the
record so the profile can credit it.

## Satellite imagery

The basemap is Esri World Imagery, set in `js/map.js`:

```js
const SATELLITE = { url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", name: "Esri World Imagery", maxNativeZoom: 18 };
```

That public endpoint is fine for development and evaluation. For a public launch use a keyed
provider and change those lines only:

- **Esri, same imagery**: create an API key at https://location.arcgis.com, then use
  `https://ibasemaps-api.arcgis.com/arcgis/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}?token=YOUR_KEY`
- **MapTiler**: key from https://cloud.maptiler.com/account/keys/, then
  `https://api.maptiler.com/tiles/satellite-v2/{z}/{x}/{y}.jpg?key=YOUR_KEY`

Keep the attribution line in `map/index.html` in step with the provider. India's border and the
state lines come from official Survey of India data published by DataMeet (CC BY 4.0); do not
replace them with global datasets, which draw the northern border differently.
