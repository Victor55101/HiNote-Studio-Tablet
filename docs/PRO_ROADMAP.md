# HiNote Studio Pro: propuesta y base de desarrollo

Fecha: 2026-10-27.
Estado: primera entrega de desarrollo Pro 0.1.0. Editor en vivo para texto y listas implementado; cálculos y gráficas vinculadas pendientes.
Rama: `pro-development`.
Base exacta: tag `v1.0.1`, commit `ed4d7f8a46c87d24f3c9b1893a1cb2fc9c13f696`, derivado de V54.4.
La rama de producción sigue siendo `production-v54-4`. No basar Pro en `main`, que conserva código anterior.

## Objetivo

Crear una edición orientada a apuntes técnicos: edición directa sobre la página manuscrita, tablas con cálculos y gráficas vinculadas a datos. Aprovechar la escritura personal y la interoperabilidad existentes. No presentar el alcance inicial como un reemplazo completo de Excel.

## Entrega 0.1.0

El nuevo editor compone la geometría de la escritura localmente en JavaScript y dibuja la página con los trazos de la calibración. La entrada nativa mantiene el modelo de texto, el formato, la composición de acentos y el historial. Un caché de párrafos y otro de imágenes de glifos evitan repetir trabajo que no ha cambiado.

La exportación recibe el plan de posiciones, valida sus referencias contra el documento y recupera de la calibración los puntos, presión y metadatos originales. No vuelve a distribuir el texto con otro motor.

La aplicación se instala por separado como `com.hinote.studio.pro`, versión `0.1.0`, código `1`. Sus borradores y perfiles pertenecen a esa instalación. Los respaldos de calibración se pueden importar desde la app estable.

La edición directa cubre texto y listas. Las notas que contienen tablas, fórmulas, gráficas o PDF pasan a la vista clásica, con un aviso visible. La representación y edición directa de esos objetos siguen pendientes. Las imágenes conservan sus herramientas existentes sobre la página.

Las pruebas del navegador incluyen escritura por teclado, toque, selección, formato, composición de acentos, paginación, gestos de zoom, restauración de borradores y rendimiento. Las pruebas Python verifican que la exportación conserva las posiciones y la presión, rechaza planes incompletos o inválidos y genera .hinote válidos. El rendimiento de escritorio no garantiza el mismo tiempo en una tablet física.

La separación de ramas organiza el desarrollo; no crea automáticamente otra aplicación instalable. Antes del primer APK Pro se definirá una identidad de paquete de desarrollo independiente para probar ambas instalaciones sin sustituir la app estable ni sus datos. Nombre comercial, precio, identificador definitivo y mecanismo de compra quedan pendientes.

## Editor unificado: experiencia propuesta

- Una zona amplia con las páginas del documento y la escritura de la calibración elegida.
- Tocar una palabra sitúa el cursor; seleccionar texto permite modificarlo sin abandonar la página.
- Texto con flujo normal entre líneas y páginas. No convertir cada palabra en un objeto flotante.
- Tablas, fórmulas, imágenes y gráficas se seleccionan en la misma página y muestran herramientas contextuales.
- Propiedades avanzadas en un panel desplegable; navegación por páginas y zoom sin arrastrar objetos accidentalmente.
- Teclado físico y virtual, selección, deshacer/rehacer, portapapeles y accesibilidad forman parte del alcance.
- La selección y el cursor no se exportan. El contenido y la distribución deben coincidir con la exportación.

### Evidencia en la base

`assets/index.html` mantiene un `contenteditable` para el texto y un `previewCanvas` separado.
`assets/editor.js` serializa los párrafos, solicita composición mediante AndroidBridge y dibuja una imagen de página devuelta por Android. La actualización automática actual se retrasa 700–1500 ms y se limita para documentos largos.
`PageRenderer.java` rasteriza los trazos para la vista previa.
`handwriting_composer.py` ya calcula posiciones de glifos, offsets de origen y límites de página; es una base aprovechable que debe ampliarse para identificar posiciones de cursor, espacios, saltos y rangos completos.
`tables.js` conserva celdas como segmentos de texto con formato y utiliza un diálogo de edición.
`serializeDocument()` y el borrador actual deben migrarse con compatibilidad, no sustituirse de manera destructiva.

### Trabajo técnico necesario

1. Mantener un modelo editable único con identificadores estables para bloques y objetos; las vistas no deben convertirse en fuentes independientes del documento.
2. Ampliar el resultado de composición con posiciones de inserción y rangos vinculados al texto, incluyendo Unicode, espacios, saltos, listas y celdas.
3. Dibujar cursor/selección sobre los trazos y conservar entrada de texto accesible compatible con los métodos de entrada de Android.
4. Recalcular el contenido afectado y las páginas posteriores cuando cambie el flujo, evitando recomponer innecesariamente todo el documento.
5. Mantener estable la elección de variantes de escritura para que una inserción no cambie visualmente todo el texto posterior.
6. Reutilizar la geometría de composición para edición, vista y exportación; medir rendimiento en la MatePad Pro, no solo en el navegador.

Ocultar el panel de texto o colocar una tipografía manuscrita encima de la imagen no satisface este objetivo.

## Tablas calculadas: primera entrega propuesta

- Diferenciar texto, número y fórmula; conservar fórmula y resultado por separado.
- Referencias A1, rangos y referencias absolutas como $B$2.
- Operaciones aritméticas, SUMA, PROMEDIO, MIN, MAX, CONTAR y REDONDEAR.
- Recalcular dependencias al cambiar una celda y ajustar referencias al copiar o modificar filas/columnas.
- Mensajes comprensibles para división por cero, referencias inválidas y referencias circulares.
- Formatos de número, moneda y porcentaje; precisión de cálculo separada de decimales mostrados.
- Evaluador restringido, sin ejecutar código arbitrario mediante eval.
- Compatibilidad con tablas antiguas sin convertir textos existentes que empiecen por = en fórmulas automáticamente.
- Pegado de rangos tabulados como ampliación posterior.

Ejemplo de producto: una tabla de costos que derive CT, costo medio y costo marginal a partir de los datos del usuario. El tratamiento de filas sin variación de cantidad y otros casos límite debe ser explícito.

## Gráficas vinculadas

- Seleccionar un rango y crear una gráfica de barras, líneas o dispersión.
- Guardar el vínculo mediante identificadores estables de tabla, filas y columnas.
- Actualizar al editar datos; permitir elegir encabezados, series y etiquetas.
- Definir cómo tratar celdas vacías, texto, errores, filas insertadas y rangos eliminados.
- Ofrecer una copia estática cuando el usuario quiera desvincular la gráfica.

Las fórmulas y los vínculos se conservan en el proyecto editable de HiNote. La exportación .hinote lleva los resultados y la representación gráfica compatibles con Huawei Notes. No prometer cálculo de fórmulas ni vínculos vivos dentro de Huawei Notes.

## Mejoras adicionales candidatas, todavía no comprometidas

1. Archivo de proyecto portable: reabrir texto, fórmulas, referencias y objetos editables, con respaldos y versiones de recuperación.
2. Estilos reutilizables para títulos, subtítulos y cuerpo; cambiar el estilo en todo el documento.
3. Plantillas de apuntes técnicos, prácticas y tablas de costos.
4. Buscar y reemplazar texto, navegar por títulos y miniaturas de página.
5. Guías de alineación, ajuste a cuadrícula y controles precisos para objetos.
6. Importar CSV y datos tabulados; estudiar XLSX por separado antes de prometer compatibilidad.
7. Exportación PDF además de .hinote, sujeta a pruebas de calidad y fidelidad.

No ampliar inicialmente el alcance con macros, sincronización en nube, cuentas, OCR, IA o compatibilidad completa con Excel. Requieren decisiones y validaciones independientes.

## Etapas propuestas y criterios de aceptación

1. **Prototipo del editor directo.** Una página con texto y calibración real; cursor por toque, selección, escritura, pegado y deshacer. Comparar geometría con exportación.
2. **Documento multipágina.** Saltos, listas, cambios de estilo, teclado físico/virtual, zoom, selección entre páginas, recuperación tras cierre y documentos largos.
3. **Objetos en la página.** Integrar tablas, fórmulas visuales, imágenes y gráficas sin conflictos de selección ni arrastre.
4. **Cálculo y gráficas vinculadas.** Dependencias, errores, redondeo, cambios de estructura y persistencia; validar con ejercicios conocidos.
5. **Preparación comercial.** Alcance gratuito/Pro, migración, compras y restauración si se eligen, condiciones, revisión de Huawei y APK firmado.

El trabajo de motor de cálculo puede diseñarse como módulo independiente, pero cada etapa se considera terminada solo con sus comprobaciones funcionales. El orden definitivo puede ajustarse tras probar el editor directo.

## Distribución y acceso

El APK 1.0.1 ya está disponible en un Release público de GitHub; no se conoce cuántas personas lo han descargado ni utilizado. No haberlo promocionado no demuestra ausencia de usuarios. Las condiciones actuales conservan el acceso gratuito ya ofrecido.

La matriz de funciones para una futura edición gratuita está pendiente de decisión; este cambio no retira funciones ni modifica condiciones existentes. Si se propone una edición de lanzamiento más limitada, habrá que definir el tratamiento de quienes ya recibieron la 1.0.1 y consultar el alcance de la cláusula 3.12 de Huawei. No se presupone una excepción por llamar a la distribución beta, cambiar el nombre o cambiar el paquete.

La primera entrega Pro es una prueba del editor. No activa cobros ni envía una nueva app a AppGallery.
