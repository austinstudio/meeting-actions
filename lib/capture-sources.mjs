// Where a capture came from decides how it is tagged, labelled and filed.
//
//   watch / phone  Quick Notes (Heading) voice memos: tag 'watch' (the owner filters on it), filed in the
//                  user's "Quick captures — <date>" day meeting.
//   pebble         Pebble Index memos relayed through the phone: tag 'pebble', same day meeting as the app.
//   glimpse        Glimpse (macOS screen assistant) insights posted straight to the server: tag 'glimpse',
//                  filed in their own "Glimpse — <date>" day meeting so they never mix with voice memos.
//
// Anything else is treated like the app but labelled "Capture: <source>". Contract for external clients:
// docs/glimpse-capture-contract.md.

const SOURCES = {
  watch:   { label: 'Watch capture',  tags: ['watch'],   file: 'Quick Notes', titlePrefix: 'Quick captures', filedApart: false,
             summary: date => `Voice memos captured with Quick Notes on ${date}.` },
  phone:   { label: 'iPhone capture', tags: ['watch'],   file: 'Quick Notes', titlePrefix: 'Quick captures', filedApart: false,
             summary: date => `Voice memos captured with Quick Notes on ${date}.` },
  pebble:  { label: 'Pebble capture', tags: ['pebble'],  file: 'Quick Notes', titlePrefix: 'Quick captures', filedApart: false,
             summary: date => `Voice memos captured with Quick Notes on ${date}.` },
  glimpse: { label: 'Glimpse capture', tags: ['glimpse'], file: 'Glimpse', titlePrefix: 'Glimpse', filedApart: true,
             summary: date => `Insights Glimpse spotted on screen on ${date}.` },
};

/** Normalised source id from a request body: lower-case, ≤ 40 chars, 'watch' when missing. */
export function captureSourceID(raw) {
  return typeof raw === 'string' && raw.trim() ? raw.trim().toLowerCase().slice(0, 40) : 'watch';
}

/** Tags, labels and filing rules for a source. Unknown sources get the app's defaults with a descriptive label. */
export function captureSourceMeta(source) {
  const id = captureSourceID(source);
  const known = SOURCES[id];
  if (known) return { id, ...known };
  return { id, ...SOURCES.watch, label: `Capture: ${id}` };
}

/** Suffix that separates a source's day meeting from the app's ('' when it shares the app's meeting). */
export function dailyMeetingSuffix(source) {
  const meta = captureSourceMeta(source);
  return meta.filedApart ? `_${meta.id}` : '';
}
