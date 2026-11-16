/* Loads the maths solver for tests the way the page does: as a plain script that leaves the global `nerdamer`.
   (It cannot be imported or required: the bundle then looks for files that are not in vendor/.) */
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
if (!globalThis.nerdamer) vm.runInThisContext(readFileSync(new URL('../vendor/nerdamer.min.js', import.meta.url), 'utf8'));
