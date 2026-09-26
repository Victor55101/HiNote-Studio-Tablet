# HiNote Studio Tablet V22

Este directorio es el proyecto Android editable. Instrucciones completas, cambios y pruebas en `../README.md` y `../docs/PRUEBA_TABLET.md`.

Antes de abrirlo en Android Studio, ejecutar desde la raíz del repositorio:

```sh
python .github/scripts/prepare_assets.py
```

Se necesitan JDK 17, Python 3.11, Gradle 8.13 y Android SDK 35. El APK usa arm64-v8a, Android 7/API 24 como mínimo y no requiere Internet durante el uso.

El motor compone una página por vez y escribe sus trazos a archivos temporales. Canvas nativo de Android genera la imagen de cada página; el editor WebView conserva solo la imagen visible. Exportar reutiliza los binarios de esa composición.

En la tablet: escribir o pegar texto, pulsar **Actualizar**, revisar las páginas y avisos, elegir **Guardar .hinote** e importar el archivo en Huawei Notes. El borrador se guarda localmente; desinstalar la app lo elimina. La compatibilidad exacta con la versión instalada de Huawei Notes debe comprobarse en el dispositivo.
