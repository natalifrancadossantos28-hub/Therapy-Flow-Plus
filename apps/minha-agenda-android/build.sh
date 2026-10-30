#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
: "${NFS_ANDROID_PLATFORM:?Informe a pasta do SDK que contém android.jar}"
: "${NFS_ANDROID_BUILD_TOOLS:?Informe a pasta das ferramentas Android}"
: "${NFS_ANDROID_KEYSTORE:?Informe o keystore de assinatura}"
: "${NFS_ANDROID_PASSWORD_FILE:?Informe o arquivo privado com a senha do keystore}"
mkdir -p build/generated build/classes build/dex build/test
javac -source 8 -target 8 -d build/test src/br/com/nfs/minhaagenda/Planner.java tests/PlannerTest.java
java -cp build/test br.com.nfs.minhaagenda.PlannerTest
"$NFS_ANDROID_BUILD_TOOLS/aapt2" compile --dir res -o build/resources.zip
"$NFS_ANDROID_BUILD_TOOLS/aapt2" link -o build/resources.apk --manifest AndroidManifest.xml -I "$NFS_ANDROID_PLATFORM/android.jar" --java build/generated -A assets build/resources.zip
find src build/generated -name '*.java' > build/java-files.txt
javac -encoding UTF-8 -source 8 -target 8 -Xlint:deprecation -classpath "$NFS_ANDROID_PLATFORM/android.jar" -d build/classes @build/java-files.txt
python3 - <<'PY'
from pathlib import Path
from zipfile import ZipFile
with ZipFile('build/classes.jar','w') as archive:
    for path in Path('build/classes').rglob('*.class'):
        archive.write(path,path.relative_to('build/classes'))
PY
"$NFS_ANDROID_BUILD_TOOLS/d8" --min-api 28 --lib "$NFS_ANDROID_PLATFORM/android.jar" --output build/dex build/classes.jar
cp build/resources.apk build/unaligned.apk
(cd build/dex && zip -q ../unaligned.apk classes.dex)
"$NFS_ANDROID_BUILD_TOOLS/zipalign" -f -p 4 build/unaligned.apk build/aligned.apk
"$NFS_ANDROID_BUILD_TOOLS/apksigner" sign --ks "$NFS_ANDROID_KEYSTORE" --ks-pass "file:$NFS_ANDROID_PASSWORD_FILE" --ks-key-alias minha-agenda --out build/Minha-Agenda-Android-teste.apk build/aligned.apk
"$NFS_ANDROID_BUILD_TOOLS/apksigner" verify --verbose build/Minha-Agenda-Android-teste.apk
"$NFS_ANDROID_BUILD_TOOLS/zipalign" -c -p 4 build/Minha-Agenda-Android-teste.apk
sha256sum build/Minha-Agenda-Android-teste.apk
