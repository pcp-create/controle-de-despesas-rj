import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const root = fileURLToPath(new URL('../../', import.meta.url));
const android = resolve(root, 'apps/mobile/android');
const failures = [];
if (Number(process.versions.node.split('.')[0]) < 22) failures.push('Use Node 22 ou superior.');
const java = process.env.JAVA_HOME ? resolve(process.env.JAVA_HOME, 'bin/java') : 'java';
const version = spawnSync(java, ['-version'], { encoding: 'utf8' });
if (!/version "21[.\"]/.test(version.stderr || '')) {
  failures.push('Configure JAVA_HOME para JDK 21 (o Java padrão deste Codespace é 25).');
}
const properties = resolve(android, 'local.properties');
const localSdk = existsSync(properties)
  ? readFileSync(properties, 'utf8').match(/^sdk\.dir=(.+)$/m)?.[1].trim().replace(/\\:/g, ':').replace(/\\\\/g, '\\')
  : undefined;
const sdk = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT || localSdk;
if (!sdk || !existsSync(resolve(sdk, 'platforms/android-36/android.jar'))) {
  failures.push('Instale Android SDK Platform 36 e configure ANDROID_HOME ou android/local.properties.');
}
if (!sdk || !existsSync(resolve(sdk, 'build-tools'))) {
  failures.push('Instale Android SDK Build-Tools pelo SDK Manager.');
}
const id = 'br.com.rjcompressores.despesasmobile';
const gradle = readFileSync(resolve(android, 'app/build.gradle'), 'utf8');
const config = readFileSync(resolve(root, 'apps/mobile/capacitor.config.ts'), 'utf8');
const strings = readFileSync(resolve(android, 'app/src/main/res/values/strings.xml'), 'utf8');
if (!gradle.includes(`applicationId "${id}"`) || !gradle.includes(`namespace = "${id}"`)
    || !config.includes(`appId: "${id}"`) || !strings.includes(`>${id}</string>`)) {
  failures.push('A identidade Android divergiu da identidade escolhida: ' + id);
}
if (failures.length) {
  for (const failure of failures) console.error('- ' + failure);
  process.exitCode = 1;
} else {
  console.log('Ambiente Android pronto: JDK 21, SDK 36, Build-Tools e identidade exclusiva.');
}
