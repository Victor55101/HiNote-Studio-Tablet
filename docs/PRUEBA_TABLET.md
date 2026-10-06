# Comprobación en la tablet

## V33: comprobaciones pendientes en Huawei Notes

1. Antes de cambiar la instalación, exporta notas y perfiles de V32 y conserva el texto y los recursos del borrador. La clave de firma anterior no se recuperó; el APK V33 no puede actualizar V32 directamente.
2. Recrea la gráfica de la captura: puntos (10,5), (30,30), (40,50), (50,50), (60,20), (70,70), (80,50), (90,90), (100,40), curva suave, título Oferta y guías. Exporta e importa el archivo `.hinote`. Compara el grosor al inicio, mitad y final de cada tramo; prueba varios niveles de zoom y el lazo de Notes. Los segmentos de la curva son tinta nativa independiente.
3. Exporta una fracción anidada con paréntesis y corchetes y compara con la vista previa. Repite con Original y con tu perfil personal. El contorno debe conservar la letra calibrada y los delimitadores estirados mantener un grosor uniforme.
4. En la gráfica comprueba un cuadro entre el borde izquierdo y el comienzo del trazado, y un cuadro debajo. Revisa fórmulas junto a gráficas en los dos órdenes y deshaz la colocación para comprobar los anchos originales.
5. Abre una fórmula: aparece la ayuda. Inserta un molde vacío: aún aparece. Escribe con teclado físico o botones: desaparece. Provoca un error de casilla incompleta: ese aviso debe seguir visible mientras escribes.
6. Usa X 0–100/paso 20 e Y 0–100/paso 10. Con Tocar para agregar y Atraer a divisiones y mitades, toca puntos alejados de las divisiones y luego cerca de X=10/Y=15. Los primeros conservan decimales; los cercanos se aproximan. Repite con zoom, con la atracción desmarcada y escribiendo coordenadas exactas. Tocar un punto existente sigue seleccionándolo.
7. Combina páginas del documento abierto (incluida una página solo con imágenes) con un cuaderno importado. Revisa el orden antes de guardar y comprueba que usa la carpeta recordada y crea otra copia si el nombre ya existe.

## V30: escritura matemática y combinación de páginas

1. Abre el borrador anterior y comprueba texto, tablas, imágenes y perfil. En una tabla, selecciona dos columnas y después dos filas: la selección debe acumularse. Estándar sigue siendo 60 %.
2. En **Fórmulas y gráficas → Insertar fórmula**, escribe `x=` e inserta una fracción. Llena numerador/denominador, inserta una raíz y una potencia dentro del numerador. Toca los campos, navega con los botones y prueba insertar un molde envolviendo texto seleccionado. Revisa Deshacer fórmula/Rehacer y color del campo activo.
3. Reproduce una matriz, una derivada, una integral con límites y una sumatoria de tus apuntes. Prueba una fórmula centrada, tamaño 60 % y dimensiones de medio cuadro. Actualiza la vista: no debe haber trazos superpuestos ni datos omitidos. Una fórmula demasiado ancha debe reducirse uniformemente o explicar cómo ajustarla.
4. Usa Original y después tu calibración ampliada. Los signos disponibles en tu letra deben usar sus muestras; un signo incluido sin muestra usa la forma geométrica con aviso. Un carácter desconocido pide calibrarlo. Exporta e importa el `.hinote` para comprobar la escritura y los signos en Notes.
5. Inserta una gráfica con ejes Q/P. Escribe `1; 9; A`, `4; 5; B` y `9; 2; C` en líneas separadas; elige Curva suave y guías punteadas. Añade otro trazo ascendente rojo. Cambia escala, flechas, rangos negativos y etiquetas. Arrastra un punto y toca para agregar otro; prueba ajustar a medio paso y dejar coordenadas libres.
6. Coloca dos gráficas lado a lado: izquierda 1/ancho 7 e izquierda 8.5/ancho 7 con Al lado del anterior. Prueba espacio previo de 0.5 y diferentes alturas. Cerca del final de página, ambas deben pasar completas a la siguiente. Escribe `Hola` después: debe volver a la línea inferior habitual del cuadro. Comprueba bloques entre tablas y texto.
7. Deshaz/repite una inserción, modifica un bloque, cancela y elimina. Cierra la app mientras escribes una fórmula y mientras editas coordenadas aún sin salir del campo: deben recuperarse al reabrir. Prueba zoom y arrastre táctil en la previsualización; los controles deben permanecer visibles dentro del panel.
8. Exporta desde Notes una copia del cuaderno del semestre y el apunte nuevo. En **Guardado → Combinar cuadernos .hinote**, agrega los dos, selecciona sus páginas y revisa miniaturas y orden. Guarda con otro nombre. Reimporta la copia y comprueba primera página, unión entre cuadernos y última página, tinta, fotos, formas y papel. Los originales deben conservarse.
9. Repite con el `.hinote` de ejemplos: sus páginas originales 8 y 9 deben convertirse en 1 y 2 en la copia. Prueba cambiar el orden, quitar páginas, cancelar selección y cancelar guardado. Un archivo dañado debe explicar el fallo y permitir volver a intentarlo.

La validación automática comprueba hashes, referencias, formato de tinta, paginación y conservación byte por byte de las muestras. La importación, los gestos de HarmonyOS y el uso del lasso siguen requiriendo esta comprobación en la tablet. Combinar crea un cuaderno nuevo: no escribe directamente dentro del cuaderno que está abierto en Huawei Notes.

## V29: formato conjunto y nitidez

1. Crea una tabla: Estándar debe usar 60 %. Escribe dos renglones breves en una fila de un cuadro y compara con el texto normal exterior al 100 %.
2. Toca **Seleccionar celdas**, marca varias celdas separadas y cambia Alinear, Vertical y Tamaño de selección. Solo las marcadas deben cambiar y permanecer seleccionadas después de cada ajuste. Prueba también color/grosor, Seleccionar fila, Seleccionar columna, Toda la tabla y Mayús + clic con teclado. Terminar selección vuelve a escribir en una celda.
3. Si marcas celdas con valores diferentes, debe aparecer Mixto. Elige Fijo · 60 %, cambia a otra celda y regresa; el selector nunca debe quedar vacío. Repite con 50 % y tras cerrar/reabrir el borrador. Los controles de ancho/alto actúan sobre la columna/fila activa indicada.
4. Cambia Tamaño de tabla entre Estándar y Ajustar al espacio. Las celdas Según tabla lo siguen; las de tamaño fijo conservan su valor. Para homogeneizar una tabla anterior, usa Toda la tabla y Según tabla. Comprueba deshacer, cancelar y recuperar una edición pendiente.
5. Coloca texto antes y después. Mover tabla arriba/abajo debe cambiar el orden respecto a esos bloques, sin borrar texto. Los botones se desactivan en los extremos.
6. En la pestaña Tablas, prueba zoom pequeño/grande y desplázate vertical y horizontalmente. ↔, Editar tabla y ↘ deben permanecer completos dentro de la vista cuando la tabla sea visible; comprueba arrastre y edición con un dedo.
7. Amplía una página: la tinta debe definirse mejor después de una pausa breve, sin regenerar todo el cuaderno. Cambia rápidamente de página y zoom: no deben aparecer páginas antiguas ni bloquearse el editor. Prueba con un cuaderno largo, imágenes y una calibración propia.
8. Actualiza, guarda el .hinote y comprueba texto/tablas/miniaturas en Huawei Notes. La mayor resolución de vista no cambia los trazos ni el formato del fondo exportado.

Antes de desinstalar por diferencia de firma, respalda .hnprofile, exporta notas y conserva texto: la desinstalación borra borrador, imágenes privadas y perfiles añadidos.

## V28: continuidad de renglones y texto después de una tabla

1. Abre la tabla de V27 que mostraba el salto antes del tercer renglón y pulsa **Actualizar**. Debe mantener dos renglones por cuadro, sin el hueco adicional. Comprueba tanto texto ajustado automáticamente como saltos introducidos con Enter.
2. Prueba Estándar y Compacta con letras acentuadas y descendentes (`g`, `p`, `q`, `y`). Una línea vacía que hayas escrito expresamente debe conservarse.
3. Escribe `Hola` al 100 % después de una tabla de altura entera y después de otra que termine a medio cuadro. Debe recuperar la alineación inferior habitual del texto normal. Comprueba también una lista después de la tabla y texto antes de ella.
4. Repite cerca del final de una hoja: si el texto normal debe pasar a la siguiente, debe comenzar en su margen habitual. La tabla sigue paginándose por filas completas.
5. Guarda un nuevo `.hinote` y ábrelo en Huawei Notes para comprobar ambas correcciones. Los archivos exportados anteriormente no cambian por instalar el APK.

## V27: tablas manuscritas

El usuario confirmó la importación V26 y la creación de Original ampliada. El formato V27 es compatible con los perfiles, imágenes, borrador y carpeta anterior. Sin embargo, el APK de depuración tiene una firma distinta al V26 entregado: respalda los perfiles `.hnprofile`, exporta las notas y conserva el texto **antes de desinstalar**, porque la reinstalación borra los datos privados. Tras instalar, importa los respaldos y vuelve a elegir la carpeta.

1. Abre **Tablas → Insertar tabla** entre dos párrafos. Reproduce la muestra de tres columnas: anchos 4, 5 y 6 cuadros, sangría 1, y alturas mínimas 1, 2, 2, 3, 2 y 6. Añade dos filas para obtener las seis de la muestra.
2. Escribe en las celdas y prueba **Estándar · 73 %** y **Compacta · ajuste 65–50 %**. La primera mantiene la letra y deja crecer las filas; la segunda intenta ajustar la letra al espacio. También hay tamaño fijo por celda. Comprueba dos renglones por cuadro y letras con tildes/descendentes.
3. Centra el encabezado y deja el cuerpo a la izquierda. Cambia la alineación vertical. Selecciona unas palabras dentro de una celda y aplica rojo o grosor; las demás deben conservar su estilo.
4. Arrastra los controles de anchura/altura con un dedo y prueba valores de medio cuadro. Toca **Aplicar tabla**, luego **Actualizar**. En la previsualización, los controles de Tablas permiten moverla y redimensionarla; el botón **Editar tabla** debe abrir sus celdas sin desplazar la página.
5. Llena suficientes filas para ocupar varias páginas. Cada fila debe saltar completa, con todas sus columnas, sin perder texto. Prueba repetir y no repetir el encabezado. Una fila más alta que una página debe explicar el problema; usa Compacta, amplía la columna o divide su contenido en varias filas.
6. Pega texto separado por tabulaciones en varias celdas y usa Enter dentro de una celda. Prueba Antes/Después, añadir/eliminar filas y columnas, deshacer/rehacer, cancelar y cerrar la app mientras editas. La edición pendiente debe poder recuperarse.
7. Exporta e importa el `.hinote` en Huawei Notes. Comprueba letra, grosor, color, cuadrícula y saltos. Selecciona el contorno rectangular y los separadores: se exportan como formas nativas independientes, y la escritura conserva sus trazos. Studio conserva las celdas estructuradas; Notes recibe formas y escritura, no una tabla de procesador de textos.
8. Revisa una nota mixta con texto, tablas e imágenes. Comprueba también una nota anterior sin tablas y el perfil Original ampliada.

Límites: 50 tablas, 12 columnas y 200 filas por tabla, 2000 celdas y 200000 caracteres compartidos por nota; hasta 500 páginas y 512 MiB de composición. No se combinan celdas en V27. Una celda excesivamente larga se detecta sin planificar todos sus trazos. Las imágenes siguen posicionadas por página y no reservan espacio automáticamente.

## V26: reimportar la plantilla completada

El usuario confirmó que el grosor V25 funciona. Su nota real de cinco signos permite reproducir el rechazo de dos líneas nativas, corregido en V26.

1. Actualiza a V26 conservando los datos de la app. En **Calibración → Mis calibraciones**, selecciona Original y marca **Completar el perfil seleccionado**.
2. Importa el mismo `.hinote` de los signos `! ¡ & $ °` que falló en V25. No hace falta generar ni escribir otra plantilla.
3. La revisión debe indicar **Original ampliada**, **110 encontrados**, **0 faltantes** y **8/8** para cada signo. Pulsa **Guardar perfil**, luego **Usar en esta nota**.
4. Comprueba `¡Hola! & $ °` en la previsualización y en una nota exportada a Huawei Notes. Comprueba varias apariciones de `!` y `¡` para cubrir las diferentes variantes.
5. Respalda y reimporta el perfil. Vuelve a Original: debe conservar sus 105 caracteres y cinco pendientes. Reabre la app y comprueba que los dos perfiles siguen disponibles.

La nota recibida contiene 68 trazos y 2131 puntos: todos de Rotulador, con 66 trazos de tipo 0 y dos segmentos de tipo 2. En desarrollo se comprobaron importación, todas las variantes, conservación del banco original, respaldo y exportación de los ocho juegos de muestras. Queda la confirmación en la tablet con el APK corregido.

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
