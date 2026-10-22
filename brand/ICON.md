# App icon

`icon-3.jpg` is the app icon for Pixmotion AI. It is declared in the top-level
`icon` block of `dapp.json` and read by the platform at deploy time to
reconcile the app's home-screen tile (rounded and cropped to the tile). It is
kept here, outside `public/`, so the app itself does not serve it.

The platform keys its stored icon on the file path, so re-declaring an
unchanged path keeps serving the previously cached image; a new filename makes
the tile re-render, which is why each icon revision lands under a fresh name.
The earlier artwork this replaced is no longer kept in the repo.

`icon-3.jpg` is the artwork supplied for this revision: a white profile-head
glyph holding a small network of connected nodes, on a blue to magenta
gradient. It is used as-is, byte for byte, with no redraw or retouching: it is
the chosen artwork, so the platform's default drawn-glyph icon style does not
apply.

The file's bytes are JPEG (27,061 bytes, 558x542 px).
