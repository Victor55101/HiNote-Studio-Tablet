# HiNote Studio Tablet — V26

App Android para convertir texto a trazos manuscritos, guardar varias calibraciones personales y exportar notas a Huawei Notes como `.hinote`.

## V26: corrección de importación de calibraciones

Huawei Notes guardó dos segmentos rectos de una plantilla completada como trazos nativos de tipo 2. V25 los rechazaba aunque todos los trazos fueran de Rotulador. V26 admite esos segmentos conservando su tipo, geometría y presión; utiliza los mismos formatos admitidos al importar una nota y al recuperar un respaldo. Se mantienen las comprobaciones de herramienta, celdas, páginas y límites, con mensajes separados para una herramienta distinta o un formato aún no compatible.

Las plantillas ya escritas se pueden reutilizar. En la muestra real recibida, completar Original añade `! ¡ & $ °` con ocho variantes cada uno: **110 encontrados, cero faltantes**. Guarda el perfil **Original ampliada** y pulsa **Usar en esta nota**. Original permanece protegida. El botón de importación también conserva su altura cuando la etiqueta ocupa dos líneas.

## V25: grosor y mis calibraciones

- **Texto → Grosor**: niveles 1–10 independientes del tamaño de letra, aplicables a una selección y a marcadores de lista. **Calibrado** conserva el grosor original de cada trazo y es el valor inicial, también para borradores anteriores. Los cambios admiten deshacer/rehacer y se conservan al cerrar la app.
- **Calibración → Mis calibraciones**: Original sigue siendo la letra predeterminada y está protegida. Se pueden guardar hasta 20 perfiles adicionales, nombrarlos, duplicarlos, alternar entre ellos y respaldarlos como `.hnprofile`. Una importación no activa ni reemplaza automáticamente la letra de la nota.
- **Ver encontrados / Ver faltantes** en cada perfil: caracteres identificados, código Unicode, variantes disponibles de ocho, variantes incompletas y búsqueda. Los faltantes se distinguen entre disponibles en Original y sin muestra. Los avisos al componer indican cuándo se usa Original o se deja espacio.
- Plantillas `.hinote` identificadas y versionadas, con una fila por carácter, ocho celdas y línea base azul. Selección por grupos (español, matemáticas, programación, tipografía) o caracteres adicionales; hasta 256 por plantilla/perfil. También se puede generar una plantilla **solo de los faltantes**.
- Importación con revisión previa, comprobación de páginas, guías, celdas y límites. Las filas vacías no borran muestras anteriores. Completar Original crea **Original ampliada** y deja intacta la calibración incluida. Eliminar un perfil permite recuperar la última eliminación.
- El proceso usa el hilo de trabajo existente, permite cancelar y guarda perfiles de forma atómica. El lector acota el tamaño de archivos, páginas, trazos y puntos. No se cargan todos los bancos personalizados simultáneamente.

### Crear y completar una calibración

1. Abre **Calibración → Mis calibraciones → Crear plantilla**. Elige grupos o escribe los caracteres que necesitas; guarda la plantilla `.hinote` y ábrela en Huawei Notes.
2. Escribe con **Rotulador**, preferiblemente grosor 1–3. Cada fila indica el carácter: escribe ocho versiones, una dentro de cada celda, apoyadas en la línea azul. Los descendentes y `_` deben quedar debajo de esa línea. Conserva todas las páginas, su orden, dimensiones y las imágenes de guía. No muevas, gires, recortes ni escribas sobre la etiqueta o el código inferior. Las líneas rectas nativas de Rotulador también se admiten.
3. Exporta la nota escrita como `.hinote`. En Studio, pon un nombre y pulsa **Importar .hinote / respaldo**. Revisa encontrados, faltantes y variantes; pulsa **Guardar perfil**, luego **Usar en esta nota** cuando quieras activarlo.
4. Para completar una letra guardada, selecciónala, crea una plantilla de los faltantes (o de caracteres concretos que quieras repetir) y escribe esas filas. Al importar, marca **Completar el perfil seleccionado**. Los caracteres con muestras se añaden o sustituyen; los demás se conservan. Si el seleccionado es Original, se crea una copia ampliada.
5. **Respaldar** exporta un `.hnprofile`. Reimportarlo siempre crea un perfil nuevo, sin reemplazar los existentes. Haz respaldos antes de desinstalar la app. Los archivos `.hinote` ya exportados son independientes de sus perfiles.

El estándar pide ocho variantes; se aceptan de una a siete con aviso para poder completar después. Una plantilla totalmente vacía se rechaza. La asociación se basa en la celda, **no en OCR**: una `b` escrita en la fila de `a` se interpretará como `a`; revisa la muestra de escritura antes de usarla. Las notas arbitrarias y plantillas antiguas sin identificador no se importan automáticamente: el banco Original ya está incluido. El PDF no contiene la información nativa necesaria y no se usa como calibración.

La equivalencia 1–10 se basa en los archivos de grosor aportados por el usuario: en Rotulador, el ancho nativo es el nivel dividido entre tres. Se mantienen geometría y presión. La previsualización aproxima la pincelada; la apariencia definitiva depende del renderizador de Huawei Notes. Las nuevas plantillas requieren comprobar su ida y vuelta real en la tablet.

## Funciones conservadas

- Las miniaturas exportadas usan el papel nativo `base3` de la plantilla Huawei, independientemente del interruptor de cuadrícula de la previsualización. Así se evita alternar entre hoja blanca/cuadrícula tenue y el papel nativo mientras carga una página.
- **Guardado → Elegir carpeta** recuerda la carpeta y el permiso de Android entre sesiones. **Guardar .hinote** guarda allí directamente y crea otra copia numerada si ya existe el nombre. **Preguntar cada vez** restablece el selector anterior. Si la carpeta se mueve, elimina o pierde su permiso, se solicita volver a elegirla.
- Se conservan los espacios y tabulaciones al inicio de cada párrafo, incluido texto con formato mixto. Los renglones creados por ajuste automático vuelven al margen normal; una sangría demasiado larga se distribuye sin sacar los trazos de la página.
- El guion bajo queda debajo de la línea base de las letras, conservando el glifo de su fila de calibración.
- Imágenes JPG, PNG y WebP estático desde el selector de Android. Transparencia conservada y orientación EXIF aplicada.
- Modo Imágenes: mover con un dedo, pellizcar/girar con dos, controles de esquinas, ángulo numérico, giros de 90°, recorte, reemplazar, duplicar y eliminar. Deshacer/rehacer incluye las imágenes.
- Páginas con imágenes nativas editables en Huawei Notes. Orden entre imágenes; la escritura permanece siempre encima. Las imágenes se anclan a una página, no al párrafo: no hay ajuste automático del texto alrededor de ellas.
- Borrador V25 con copia nativa atómica y migración de V21/V22/V23/V24. Conserva el almacén anterior: los archivos de imagen se guardan fuera de `localStorage` y sobreviven al cierre normal y a la recuperación del WebView.
- Importación y exportación en el hilo de trabajo; miniaturas de imagen de hasta 512 px, máximo 20 imágenes visibles por página y 200 por documento. Original normalizado de hasta 2560 px; entrada máxima 32 MiB/100 MP, almacén de 256 MiB. WebP se convierte a JPG o PNG; las animaciones no se conservan.
- Logo de HiNote Studio integrado en el editor y como icono normal/adaptativo de Android.
- Asociaciones de calibración reconstruidas desde la nota original para `+`, `=`, `%`, `#`, `@`, `•`, `*` y `<`. Las listas de viñetas y asteriscos usan ahora sus trazos manuscritos correctos.
- El guion bajo `_` conserva su glifo propio y su posición inferior; ya no se superpone visualmente con el guion `-`.
- Composición por páginas en un hilo de trabajo. Los trazos se guardan en archivos temporales; el editor recibe un resumen y carga una sola imagen por página.
- Cancelación de trabajos obsoletos, progreso visible y eliminación de temporales. La exportación utiliza los mismos trazos que la vista previa.
- Escritura y validación de los archivos binarios y ZIP por bloques. Se evita conservar todos los puntos y miniaturas del documento en memoria.
- Ajuste de palabras largas, caracteres Unicode normalizados y trazos descendentes. Avisos de caracteres sin calibrar agrupados.
- Editor con pegado multilínea, selección persistente, formato absoluto, listas que conservan el formato, deshacer/rehacer y borrador local.
- Notas largas: actualizar manualmente; el modo automático funciona hasta 12000 caracteres. Límites de protección: 200000 caracteres, 10000 párrafos, 20000 segmentos, 500 páginas y 512 MiB de archivos de composición.

La compilación genera `glyphs_v24.json` combinando el banco original archivado con las asociaciones corregidas de la nota de calibración. V25 conserva ese banco y sus posiciones corregidas sin alterarlos; los perfiles adicionales se guardan por separado en el almacenamiento privado de la app. Se mantienen las claves y rutas del borrador V23 para migrar sin perder texto ni imágenes.

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

Los APK de depuración pueden tener una firma distinta de la instalación anterior. Conserva tus notas, una copia del texto y respaldos de tus perfiles antes de desinstalar una versión: desinstalar borra el borrador, las imágenes privadas y las calibraciones añadidas.
