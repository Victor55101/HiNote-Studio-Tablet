# Comprobación en la tablet

1. Conserva una copia del texto de la instalación anterior y de tus notas antes de cambiar de APK.
2. Confirma que el nuevo logo aparezca tanto en el lanzador de Android como en el encabezado del editor.
3. Escribe `_-Hola`: `_` debe quedar debajo de `-`, usando dos trazos de calibración distintos. Crea además una lista `• Viñeta`, otra `* Asterisco` y otra `- Guion`; comprueba que se vean respectivamente como círculo, asterisco y guion manuscritos.
4. Escribe una nota corta con `l`, `Y`, tildes, `ñ`, `+`, `=`, `%`, `#`, `@`, `<` y puntuación. Revisa los avisos sobre caracteres sin calibrar.
5. Selecciona texto y aplica tamaños, color y opacidad. Repite un tamaño y comprueba que no se multiplica. Prueba deshacer y rehacer, pegar varias líneas en medio de un párrafo y continuar/terminar listas con Enter.
6. Cierra y abre la app: comprueba el borrador, su formato y el título. Prueba el teclado virtual que utilizas habitualmente y la selección táctil.
7. Genera varias páginas. Revisa primera, intermedia y última; guarda el `.hinote`, impórtalo en Huawei Notes y compara los trazos y el número de páginas. Verifica los trazos editables con el lápiz.
8. Prueba un documento largo aumentando gradualmente su tamaño. Actualiza manualmente; cambia de página y cancela una generación. Cancela también el selector de guardado y una exportación en marcha.
9. Si aparece un fallo, anota modelo de tablet, versión de HarmonyOS/EMUI y Huawei Notes, caracteres/páginas, pasos exactos y mensaje visible. Adjunta un texto de ejemplo sin información privada y, si es posible, el registro de Android Studio/logcat.

La reconstrucción del formato `.hinote` se basa en la plantilla del proyecto. La importación y el consumo total de memoria requieren comprobación en el dispositivo; las pruebas automatizadas cubren estructura, hashes, trazos, cancelación y edición.

## V23: imágenes y tacto

Dispositivo objetivo proporcionado: MatePad Pro 2025, HarmonyOS 4.3.0, Huawei Notes 12.4.3.380.

1. Inserta JPG, PNG opaco, PNG transparente, WebP y captura vertical. Cancela también el selector y comprueba que la app se desbloquee.
2. Mueve con un dedo; cambia tamaño y gira con dos; prueba las cuatro esquinas, el control circular, 90° y el ángulo numérico 320°. Deshaz y rehace cada gesto.
3. Recorta con el rectángulo táctil y con deslizadores; restablece, cancela y deshaz. El borrador conserva el original.
4. Superpón dos imágenes y comprueba Atrás/Adelante. La escritura debe permanecer encima en la previsualización y en Notes.
5. Pon texto arriba y abajo dejando líneas vacías. La imagen no se ancla al párrafo; al modificar texto no se mueve ni reserva espacio automáticamente.
6. Añade una página de imágenes y mueve otra imagen a una página distinta. Navega, acorta el texto y comprueba que no desaparezcan imágenes ni sus páginas.
7. Cierra y vuelve a abrir la app. Comprueba texto, título, estilos, imágenes, tamaño, giro, recortes y páginas vacías añadidas.
8. Exporta e importa en Huawei Notes. Selecciona una imagen nativa y confirma que puedes moverla/redimensionarla; revisa transparencia, giro, recorte y capas. Edita los trazos por separado.
9. Prueba un documento de más de 66000 caracteres con imágenes repartidas. Cancela la exportación, vuelve a guardar y revisa primera, intermedia y última página.
10. Comprueba `_-Hola`: el guion bajo debe verse ligeramente más abajo que en V22.

Límites de seguridad: 20 imágenes por página, 200 por nota, 32 MiB/100 MP por archivo de entrada y 256 MiB de imágenes normalizadas almacenadas. El procesamiento no conserva las animaciones WebP. Las miniaturas son de 512 px; la imagen exportada usa el archivo normalizado de mayor resolución.

## V24: papel nativo, guardado y espacios

La importación nativa y las funciones de imágenes V23 fueron confirmadas por el usuario en su MatePad. Para esta actualización:

1. Exporta una nota con varias páginas, imágenes y páginas vacías con la cuadrícula de previsualización activada y otra desactivada. Importa ambas como notas nuevas. Al desplazarte, sus miniaturas deben conservar el papel cuadriculado de Huawei. Las notas exportadas con versiones anteriores conservan sus miniaturas antiguas; vuelve a exportarlas para aplicar la corrección.
2. Comprueba `_-Hola` al 100 % y 200 %: `_` ahora debe quedar por debajo de la base de `Hola`.
3. Escribe `         O --- O` y, en la siguiente línea, doce espacios seguidos de `I`. Actualiza, exporta y confirma que se mantiene la sangría. El ancho de la letra manuscrita es variable; no equivale a una fuente monoespaciada para diagramas.
4. Abre **Guardado → Elegir carpeta**, selecciona una carpeta local para tus notas y guarda. Repite sin abrir el selector: los archivos deben aparecer allí como `Título.hinote`, `Título (1).hinote`, etc., conservando las copias anteriores.
5. Cierra y abre la app; verifica la carpeta. Cancela un cambio de carpeta y comprueba que se conserva la anterior. Con **Preguntar cada vez**, el guardado vuelve a abrir el selector.
6. Comprueba la cancelación de una exportación larga: no debe quedar un `.hinote` incompleto. Si se elimina la carpeta o revoca su permiso, la app debe mostrar un error y permitir elegir otra desde Guardado.

Android puede impedir seleccionar la raíz del almacenamiento o la carpeta Descargas completa; elige o crea una subcarpeta, por ejemplo Documentos/HiNote. La selección usa el permiso persistente del sistema y no requiere acceso general a todos los archivos.
