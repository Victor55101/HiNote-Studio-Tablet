# Comprobación en la tablet

## V25: grosor, plantillas y perfiles

El usuario confirmó el funcionamiento en su tablet del guion bajo, la carpeta recordada y el fondo exportado V24. Para V25:

1. Abre el borrador anterior: texto, estilos, imágenes, carpeta y letra Original deben conservarse. **Calibrado** conserva el grosor de antes.
2. Escribe `Hola _- • * V[]`. Aplica por selección grosor 1, 2 y 3, y prueba también 10. Cambia tamaño por separado; deshaz/rehaz y reinicia. Exporta e importa en Huawei Notes: compara los niveles, posiciones y presión con la muestra de grosor aportada.
3. Abre **Calibración → Mis calibraciones**. Original debe estar activa y no permitir renombrar/eliminar. Revisa **Ver encontrados** y **Ver faltantes**, busca `_` o `U+005F` y comprueba las ocho variantes y los signos pendientes.
4. Para una primera prueba breve, desmarca los grupos y escribe `a_!` en caracteres adicionales. Guarda la plantilla `.hinote`, ábrela en Notes y escribe ocho versiones de cada uno dentro de las celdas, con Rotulador y sin conversión a formas. Conserva la guía y su código.
5. Exporta esa nota de Notes y usa **Importar .hinote / respaldo**, sin marcar Completar. Antes de guardar debe mostrar tres encontrados; el resto aparece como disponible en Original o sin muestra. **Guardar perfil** no debe activar la letra por sí solo. Ponle nombre, úsala y comprueba `a_! Hola` en previsualización y exportación.
6. Prueba una fila con cuatro variantes y otra vacía: debe indicar `4/8` y el faltante. Selecciona **Solo los faltantes de este perfil**, crea otra plantilla y complétala. Importa marcando **Completar el perfil seleccionado**: conserva caracteres no escritos en la nueva nota. Completar Original debe crear Original ampliada sin tocar Original.
7. Crea la plantilla básica completa y repite el circuito con todas sus páginas: etiqueta, orden, ocho columnas, acentos, signos y línea base. No omitas las páginas aunque alguna fila quede vacía. La app no verifica por OCR si se escribió el carácter correcto.
8. Cambia entre perfiles, prueba la muestra sin alterar tu documento, cierra y abre la app. Deben conservarse los perfiles y la elección del borrador. Al cambiar de letra se necesita actualizar la previsualización antes de exportar.
9. Respalda un perfil `.hnprofile`, impórtalo y confirma que crea otro perfil. Duplica, renombra y elimina la copia; usa **Recuperar última eliminación**. Prueba también respaldar e importar Original.
10. Cancela los selectores y la importación. Importa una plantilla vacía, otra con un trazo cruzando celdas y otra cuya guía moviste: debe rechazarla con explicación, sin modificar perfiles. Prueba cancelar la creación de una plantilla extensa.
11. Repite una nota larga con varias páginas, imágenes y perfil propio; confirma que se puede cancelar y que las notas ya exportadas no cambian al modificar la calibración.

La importación admite hasta 32 MiB comprimidos, 64 MiB expandidos, 24 páginas y 180000 puntos en total (40000 por página). Cada perfil/plantilla admite 256 caracteres y cada carácter ocho variantes. Una guía recortada, desordenada, movida o dañada se rechaza. Los códigos toleran recomprimir la imagen en las pruebas automatizadas; la conservación real de las guías y trazos al exportar desde Huawei Notes se debe comprobar con los pasos 4–7.

## Comprobaciones generales

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
