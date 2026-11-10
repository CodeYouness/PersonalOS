// A stand-in executable for `sc`, only for the spawn wrapper's smoke test.
// The first argument after the script says what to do.
const [, , mode, ...rest] = process.argv;

if (mode === 'ok') {
  console.log(JSON.stringify({ ok: true, command: 'stub', data: { echoed: rest } }));
} else if (mode === 'fail') {
  console.log(JSON.stringify({ ok: false, command: 'stub', error: { code: 'auth', message: 'session expired' } }));
  process.exit(20);
} else {
  console.log('this is not json');
}
