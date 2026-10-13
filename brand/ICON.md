# App icon

`icon.jpg` is the app icon for QuestVerse. It is declared in the top-level
`icon` block of `dapp.json` and read by the platform at deploy time to
reconcile the app's home-screen tile (rounded and cropped to the tile). It is
kept here, outside `public/`, so the app itself does not serve it.

The artwork was supplied by scraido2 on request #13 ("Use attached picture as
the dApp icon"), replacing the request #10 artwork. It shows a cream compass
rose in a double ring with N, E, S and W letters, snow-capped mountains under
stars and a winding path inside, on brown leather. It is used as-is, byte for
byte, with no redraw or retouching: it is the owner's chosen artwork, so the
platform's default drawn-glyph icon style does not apply.

The file's bytes are JPEG (835,667 bytes, 1051x1024 px) even though the
download carried a `.png` name.