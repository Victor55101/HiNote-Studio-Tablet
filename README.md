# HiNote Studio Tablet — V23

App Android para convertir texto a los trazos de la calibración personal incluida y exportarlo a Huawei Notes como `.hinote`.

## Cambios

- Imágenes JPG, PNG y WebP estático desde el selector de Android. Transparencia conservada y orientación EXIF aplicada.
- Modo Imágenes: mover con un dedo, pellizcar/girar con dos, controles de esquinas, ángulo numérico, giros de 90°, recorte, reemplazar, duplicar y eliminar. Deshacer/rehacer incluye las imágenes.
- Páginas con imágenes nativas editables en Huawei Notes. Orden entre imágenes; la escritura permanece siempre encima. Las imágenes se anclan a una página, no al párrafo: no hay ajuste automático del texto alrededor de ellas.
- Borrador V23 con copia nativa atómica. Migra el texto de V21/V22; los archivos de imagen se guardan fuera de `localStorage` y sobreviven al cierre normal y a la recuperación del WebView.
- Importación y exportación en el hilo de trabajo; miniaturas de imagen de hasta 512 px, máximo 20 imágenes visibles por página y 200 por documento. Original normalizado de hasta 2560 px; entrada máxima 32 MiB/100 MP, almacén de 256 MiB. WebP se convierte a JPG o PNG; las animaciones no se conservan.
- Guion bajo 4 unidades lógicas más abajo que V22, manteniendo el glifo de su propia fila de calibración.
- Logo de HiNote Studio integrado en el editor y como icono normal/adaptativo de Android.
- Asociaciones de calibración reconstruidas desde la nota original para `+`, `=`, `%`, `#`, `@`, `•`, `*` y `<`. Las listas de viñetas y asteriscos usan ahora sus trazos manuscritos correctos.
- El guion bajo `_` conserva su glifo propio y su posición inferior; ya no se superpone visualmente con el guion `-`.
- Composición por páginas en un hilo de trabajo. Los trazos se guardan en archivos temporales; el editor recibe un resumen y carga una sola imagen por página.
- Cancelación de trabajos obsoletos, progreso visible y eliminación de temporales. La exportación utiliza los mismos trazos que la vista previa.
- Escritura y validación de los archivos binarios y ZIP por bloques. Se evita conservar todos los puntos y miniaturas del documento en memoria.
- Ajuste de palabras largas, caracteres Unicode normalizados y trazos descendentes. Avisos de caracteres sin calibrar agrupados.
- Editor con pegado multilínea, selección persistente, formato absoluto, listas que conservan el formato, deshacer/rehacer y borrador local.
- Notas largas: actualizar manualmente; el modo automático funciona hasta 12000 caracteres. Límites de protección: 200000 caracteres, 10000 párrafos, 20000 segmentos, 500 páginas y 512 MiB de archivos de composición.

La compilación genera `glyphs_v23.json` combinando el banco original archivado con las asociaciones corregidas de la nota de calibración. Este repositorio no contiene una pantalla para importar una nueva calibración. La fidelidad depende de los caracteres y variantes de ese banco.

## Imágenes en la tablet

1. Genera el texto y abre **Imágenes → Insertar imagen**. Elige una foto o archivo local.
2. Toca la imagen en la previsualización. Arrastra para mover; usa dos dedos para cambiar tamaño y ángulo. También puedes usar esquinas y control circular.
3. La barra Imágenes se desplaza horizontalmente: contiene Recortar, giros, Ángulo, Página, Atrás, Adelante, Duplicar y Eliminar. Atrás/Adelante solo afectan a otras imágenes.
4. Para texto arriba y abajo de una imagen, deja líneas vacías en el editor y coloca la imagen en ese espacio. La colocación es libre; no se modifica el texto al mover imágenes.
5. **＋ Página** añade una página final. El campo Página mueve la imagen a otra página y crea páginas vacías intermedias si hacen falta. Acortar el texto no elimina las páginas que contienen imágenes.
6. Recortar permite arrastrar un rectángulo o usar deslizadores. Conserva el original en el borrador; al exportar, el recorte se guarda como una imagen independiente, como en las muestras de Huawei Notes.
7. En el fondo de la previsualización, un dedo desplaza la página y dos dedos hacen zoom. Los gestos de transformación solo están activos en la pestaña Imágenes.

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
# Desde HiNote_Studio_Tablet_Android:
gradle testDebugUnitTest assembleDebug
```

Consultar `docs/PRUEBA_TABLET.md` para verificar el resultado en Huawei Notes. Las pruebas del motor en Linux y del editor en Chromium no sustituyen la prueba en una tablet física ni garantizan compatibilidad con todas las versiones de Huawei Notes.

Los APK de depuración pueden tener una firma distinta de la instalación anterior. Conserva tus notas y una copia del texto antes de desinstalar una versión: desinstalar borra el borrador local.
