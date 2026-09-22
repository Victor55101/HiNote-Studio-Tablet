# HiNote Studio Tablet

Aplicación Android/HarmonyOS para crear notas `.hinote` con escritura manuscrita personalizada y abrirlas en Huawei Notes.

Este repositorio contiene la versión para tablet del motor de HiNote Studio, basada en el motor V19 validado en Huawei Notes.

## Compilar el APK

1. Abre la pestaña **Actions**.
2. Ejecuta el workflow **Build HiNote Studio APK**, o espera a que se ejecute automáticamente tras un push a `main`.
3. Descarga el artefacto **HiNote-Studio-Tablet-APK**.
4. Descomprime el artefacto e instala `app-debug.apk` en la MatePad.

## Funciones

- Editor y previsualización directamente en la tablet.
- Escritura basada en la calibración manuscrita personalizada.
- Paginación automática.
- Listas y sublistas.
- Tamaño, color y opacidad por texto.
- Exportación directa a `.hinote`.
- Motor PencilEngine compatible con las notas que ya se validaron en Huawei Notes.

El proyecto usa Chaquopy para ejecutar el mismo núcleo Python del generador dentro de Android.
