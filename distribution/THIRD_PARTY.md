# Componentes de distribución

Avisos locales: **Archivo → Privacidad y datos → Licencias**. Se generan desde
`distribution/third_party/`, sin solicitar recursos remotos.

| Componente | Referencia | Licencia / procedencia del aviso |
| --- | --- | --- |
| Chaquopy | 17.1.0 | MIT; `chaquo/chaquopy`, etiqueta 17.1.0 |
| CPython | 3.11.17 | PSF e historial; `python/cpython`, etiqueta v3.11.17 |
| Módulos de CPython | Componentes opcionales documentados por Python | `Doc/license.rst` de v3.11.17, completo; algunos no se compilan para Android |
| OpenSSL | 3.5.9 | Apache 2.0; `openssl/openssl`, etiqueta openssl-3.5.9 |
| SQLite | 3.53.4 | Dominio público; https://sqlite.org/copyright.html |
| bzip2 | 1.0.8 | Aviso original de la versión bzip2-1.0.8 |
| libffi | 3.4.4 | MIT, aviso original de libffi v3.4.4 |
| XZ / liblzma | 5.4.6 | Declaración original COPYING de v5.4.6 |
| Certifi | Bundle CA 2026.7.22 del SDK | Aviso original y Mozilla Public License 2.0 completa |
| Setuptools | 68.2.2 en el bootstrap de referencia | MIT, conservado del bootstrap distribuido |
| pyelftools | 0.26, uso interno del SDK | Dominio público / BSD según el aviso original |
| Manrope | Tipografía del proyecto | SIL Open Font License 1.1 |

La actualización de una dependencia exige comprobar sus avisos. No se incorporan
SDK de anuncios, analítica ni informes de errores.

## Recursos propios y formato

- El logo y banco original de escritura proceden del trabajo proporcionado para
  HiNote Studio. Las muestras de otros usuarios requieren autorización para su
  distribución y permanecen en sus dispositivos.
- La cuadrícula de exportación se dibuja con líneas, sin el JPG de Huawei Notes.
  Se conservan las medidas funcionales 1000 × 1600 y el paso de 58.8 unidades.
- `base3`, la relación de aspecto y los campos de `.hinote` son referencias de
  interoperabilidad. La plantilla se reconstruye con metadatos nuevos, un
  registro binario vacío y un PNG blanco generado por el proyecto. No contiene
  miniatura, cubierta, identificadores ni trazo de la nota fuente.
- El archivo histórico fuente permanece como material de desarrollo y no se
  empaqueta en el APK. No se redistribuyen el APK ni bibliotecas de Huawei Notes.
- La revisión jurídica de marca e interoperabilidad es distinta de las pruebas
  de funcionamiento y de este inventario de componentes.
