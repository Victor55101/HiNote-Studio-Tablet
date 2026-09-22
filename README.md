# HiNote Studio Tablet

Aplicación Android/HarmonyOS para crear notas `.hinote` directamente en una HUAWEI MatePad y abrirlas después en Huawei Notes.

El proyecto usa el mismo motor PencilEngine/HiNote que ya se validó en la versión de escritorio, incluyendo las correcciones de V19 para espaciado y strokes fragmentados.

## Estado del repositorio

El workflow de compilación automática ya está configurado.

Para generar el APK falta únicamente subir a la raíz del repositorio este archivo:

`HiNote_Studio_Tablet_Android_Source.zip`

Una vez que el ZIP esté en `main`, GitHub Actions compilará automáticamente la aplicación.

## Descargar el APK

1. Abre la pestaña **Actions**.
2. Entra en **Build HiNote Studio APK**.
3. Abre la ejecución más reciente que haya terminado correctamente.
4. En **Artifacts**, descarga **HiNote-Studio-Tablet-APK**.
5. Descomprime el archivo descargado.
6. Instala `app-debug.apk` en la MatePad.

## Funciones previstas en la versión Tablet

- Editor de texto táctil.
- Previsualización paginada.
- Banco de escritura manuscrita personalizado.
- Listas y sublistas.
- Tamaño de escritura.
- Color y opacidad.
- Paginación automática.
- Exportación directa a `.hinote` usando el selector de archivos del sistema.
- Uso offline después de instalar el APK.

## Arquitectura

La aplicación es Android `arm64-v8a` y usa Chaquopy para ejecutar dentro de la tablet el núcleo Python del generador de HiNote.

El APK se compila con Java 17, Gradle y GitHub Actions.
