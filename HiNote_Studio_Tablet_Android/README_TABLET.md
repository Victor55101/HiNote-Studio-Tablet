# HiNote Studio Tablet V33

Este directorio es el proyecto Android editable. Instrucciones completas, cambios y pruebas en `../README.md` y `../docs/PRUEBA_TABLET.md`.

Antes de abrirlo en Android Studio, ejecutar desde la raíz del repositorio:

```sh
python .github/scripts/prepare_assets.py
```

Se necesitan JDK 17, Python 3.11, Gradle 8.13 y Android SDK 35. El APK usa arm64-v8a, Android 7/API 24 como mínimo y no requiere Internet durante el uso.

El motor compone una página por vez y escribe sus trazos a archivos temporales. Canvas nativo de Android genera la imagen de cada página; el editor WebView conserva solo la imagen visible. Exportar reutiliza los binarios de esa composición.

V31 corrige la edición estructurada de fórmulas. Retroceso borra texto y moldes vacíos; **Quitar molde** elimina el contenedor activo y **Deshacer fórmula** recupera sus datos. Potencias y subíndices usan la base anterior, con campos independientes y una escala de 48 %. Las casillas necesarias se validan antes de aplicar; los espacios del cursor no añaden tinta ni separación. El valor absoluto tiene márgenes simétricos. La barra principal de una fracción y los renglones de matrices se apoyan en medios cuadros.

En gráficas, **X**, **Y** y **Etiqueta** sustituyen la entrada obligatoria con separadores; pegar listas sigue disponible. Tocar un punto permite editarlo y **Borrar punto** conserva los demás; **Deshacer gráfica** recupera el cambio. Línea, puntos, guías y etiquetas tienen colores independientes; también se ajustan sus grosores y el tamaño de los puntos. Las proyecciones compartidas se dibujan una vez y las curvas punteadas mantienen el patrón entre segmentos.

**Encajar divisiones en la hoja** coloca cada división en múltiplos de medio cuadro. Tocar o arrastrar permite coordenadas libres; «Atraer a divisiones y mitades» aproxima solamente los puntos cercanos a esos valores, con tolerancia según el zoom. Las coordenadas introducidas manualmente se conservan. En escalas muy densas se utiliza espaciado continuo con un aviso para ampliar la gráfica o aumentar el paso. El editor y la exportación emplean la misma geometría. Se conservan los formatos de borrador de V30–V32 y las funciones de tablas y combinación de cuadernos.

En la tablet: escribir o pegar texto, pulsar **Actualizar**, revisar las páginas y avisos, elegir **Guardar .hinote** e importar el archivo en Huawei Notes. El borrador se guarda localmente; desinstalar la app lo elimina. La compatibilidad exacta con la versión instalada de Huawei Notes debe comprobarse en el dispositivo.

V33 incluye los cinco cambios descritos en el README principal: tinta geométrica con grosor estable, márgenes izquierdo/inferior de un cuadro, ayuda contextual de fórmula, filas con fórmulas y gráficas mezcladas y ajuste táctil por cercanía. V32 se reconstruyó del APK y se conservó en un commit separado.

El APK entregado de V33 usa una nueva clave, cuyo respaldo privado se conserva fuera del repositorio. No se puede actualizar la instalación de V32 directamente: guarda primero notas, texto/borrador y respaldos de calibración antes de desinstalarla. Una compilación futura debe usar la clave de V33 para actualizar esta versión sin desinstalar.
