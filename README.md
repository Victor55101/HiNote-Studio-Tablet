# HiNote Studio Tablet — V21

App Android para convertir texto a los trazos de la calibración personal incluida y exportarlo a Huawei Notes como `.hinote`.

## Cambios

- Composición por páginas en un hilo de trabajo. Los trazos se guardan en archivos temporales; el editor recibe un resumen y carga una sola imagen por página.
- Cancelación de trabajos obsoletos, progreso visible y eliminación de temporales. La exportación utiliza los mismos trazos que la vista previa.
- Escritura y validación de los archivos binarios y ZIP por bloques. Se evita conservar todos los puntos y miniaturas del documento en memoria.
- Ajuste de palabras largas, caracteres Unicode normalizados y trazos descendentes. Avisos de caracteres sin calibrar agrupados.
- Editor con pegado multilínea, selección persistente, formato absoluto, listas que conservan el formato, deshacer/rehacer y borrador local.
- Notas largas: actualizar manualmente; el modo automático funciona hasta 12000 caracteres. Límites de protección: 200000 caracteres, 10000 párrafos, 20000 segmentos, 500 páginas y 512 MiB de archivos de composición.

La app utiliza el banco `glyphs_v11.json` existente. Este repositorio no contiene una pantalla para importar una nueva calibración. La fidelidad depende de los caracteres y variantes de ese banco.

## Compilar

1. Instalar JDK 17, Python 3.11, Gradle 8.13 y Android SDK 35.
2. Desde la raíz: `python .github/scripts/prepare_assets.py`.
3. Abrir `HiNote_Studio_Tablet_Android` en Android Studio o ejecutar dentro de esa carpeta `gradle assembleDebug`.
4. APK en `app/build/outputs/apk/debug/app-debug.apk`.

El ZIP original se conserva como fuente de los dos recursos de calibración. El código editable está en `HiNote_Studio_Tablet_Android`; no se vuelve a extraer ni se parchea durante la compilación. El workflow de GitHub Actions verifica las pruebas y genera el APK al publicarse los cambios.

## Pruebas

```sh
python .github/scripts/prepare_assets.py
python -m unittest discover -s tests -p 'test_*.py' -v
npm install --no-save playwright@1.55.0
npx playwright install chromium
node tests/editor.spec.cjs
python tools/benchmark_engine.py --paragraphs 100
```

Consultar `docs/PRUEBA_TABLET.md` para verificar el resultado en Huawei Notes. Las pruebas del motor en Linux y del editor en Chromium no sustituyen la prueba en una tablet física ni garantizan compatibilidad con todas las versiones de Huawei Notes.

Los APK de depuración pueden tener una firma distinta de la instalación anterior. Conserva tus notas y una copia del texto antes de desinstalar una versión: desinstalar borra el borrador local.
