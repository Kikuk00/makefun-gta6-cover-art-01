// Neon Coast Cover Studio — the hand-in program for gta6-cover-art-01.
// Node 22, standard library only. It copies this repository's app/ and
// screenshots/ into the output directory and writes dossier.json with the
// vendored make.fun library, so the scorer and the judge read exactly what
// was built. Run it outside the grader with:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
// It is deterministic: two runs over the same tree write the same bytes.

import { cpSync, existsSync, mkdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-app.ts';

const repoRoot = fileURLToPath(new URL('.', import.meta.url));
const outputDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

mkdirSync(outputDir, { recursive: true });
cpSync(join(repoRoot, 'app'), join(outputDir, 'app'), { recursive: true });
mkdirSync(join(outputDir, 'screenshots'), { recursive: true });
if (existsSync(join(repoRoot, 'screenshots'))) {
  cpSync(join(repoRoot, 'screenshots'), join(outputDir, 'screenshots'), { recursive: true });
}

// The same caps the sealed scorer reads (reference/gate.json): the dossier
// text is capped at 160 KiB, at most 4 screenshots of 256 KiB each, app/ at
// most 993 entries and 48 MiB. buildDossier refuses anything over them, so
// a dossier that exists here is one the scorer accepts on these rows.
const dossierPath = join(outputDir, 'dossier.json');
writeFileSync(
  dossierPath,
  buildDossier(outputDir, {
    text_max_bytes: 163840,
    screenshots: { max: 4, max_bytes: 262144 },
    app_max_files: 993,
    app_max_bytes: 50331648,
    app_path_max_bytes: 1000,
  }),
);

// A run that wrote nothing useful should say so loudly, not exit quietly.
const { size: dossierBytes } = statSync(dossierPath);
if (dossierBytes === 0) throw new Error('dossier.json came out empty');
console.log(`Neon Coast Cover Studio handed in: dossier.json is ${dossierBytes} bytes.`);
