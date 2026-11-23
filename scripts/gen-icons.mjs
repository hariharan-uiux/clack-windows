/**
 * Generates build/icon.png (512²) and build/tray.png (32²) featuring a
 * mechanical keyboard "C" key in an isometric geometrical 3D view with
 * Clack's signature vibrant industrial orange (#f97316) illuminated legend.
 *
 * Run with: npm run icons
 */
import { execSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const pythonScript = path.join(here, 'render-3d-icons.py');

try {
  console.time('3D icon generation');
  const out = execSync(`python3 "${pythonScript}"`, { stdio: 'inherit' });
  console.timeEnd('3D icon generation');
} catch (err) {
  console.error('Failed to generate 3D icons via python3 renderer:', err);
  process.exit(1);
}
