# App icon

`icon.jpg` is the app icon for QuestVerse. It is declared in the top-level
`icon` block of `dapp.json` and read by the platform at deploy time to
reconcile the app's home-screen tile (rounded and cropped to the tile). It is
kept here, outside `public/`, so the app itself does not serve it.

The artwork was supplied by scraido2 on request #10 ("Use attached picture as
app icon"). It shows a gold compass rose in a ring over a night sky, framed in
stitched leather, with a winding mountain path, a keyhole and flag, an
explorer's hat, a coiled whip and a magnifying glass. It is used as-is, byte
for byte, with no redraw or retouching: it is the owner's chosen artwork, so
the platform's default drawn-glyph icon style does not apply.

The file's bytes are JPEG (47,383 bytes, 466x454 px) even though the download
carried a `.png` name.