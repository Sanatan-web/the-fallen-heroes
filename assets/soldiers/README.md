Portrait files for the archive.

Run `node tools/fetch-portraits.mjs` from the project root to download the images named in
`data/soldiers.json` (`image_source.url`) into this folder as `<soldier-id>.<ext>`. The script
also writes `data/portraits.json`, which the map reads; a record with a local file uses it,
otherwise the original URL is used, and a monogram is shown if neither loads.

Add a portrait by hand only when its licence allows reuse, and keep the source in the record's
`image_source` so the profile can credit it.
