"""Render the public legal pages from the same documents bundled in Android.

The target is the existing gh-pages checkout; its brand assets are preserved.
No application source, build output or signing material is copied here.
"""
from __future__ import annotations

import argparse
import html
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


def document_body(document):
    return document.split('<body>', 1)[1].rsplit('</body>', 1)[0]


def render_page(body, title, *, terms=False, licenses=''):
    headings = re.findall(r'<h2>(\d+)\. ([^<]+)</h2>', body)
    for number, label in headings:
        body = body.replace(f'<h2>{number}. {label}</h2>',
            f'<h2 id="apartado-{number}"><span class="section-number">{int(number):02d}</span>{label}</h2>')
    body = body.replace('href="privacy.html"', 'href="index.html"')
    body = body.replace('href="licenses.html"', 'href="index.html#licencias"' if terms else 'href="#licencias"')
    links = ''.join(f'<a href="#apartado-{n}"><span>{int(n):02d}</span>{label}</a>' for n, label in headings)
    current = 'terms.html' if terms else ''
    canonical = 'https://victor55101.github.io/HiNote-Studio-Tablet/' + current
    return '''<!doctype html><html lang="es-MX"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="description" content="Privacidad, condiciones de uso, contacto y licencias de HiNote Studio.">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'self'; font-src 'self'; img-src 'self'; base-uri 'none'; form-action 'none'">
<title>'''+html.escape(title)+''' · HiNote Studio</title>
<link rel="canonical" href="'''+canonical+'''">
<link rel="icon" href="assets/logo.svg" type="image/svg+xml"><link rel="stylesheet" href="assets/style.css">
</head><body><a class="skip" href="#contenido">Ir al contenido</a>
<header class="site-header"><div class="header-inner"><a class="brand" href="index.html"><img src="assets/logo.svg" width="48" height="48" alt=""><span>HiNote Studio<small>Información y contacto</small></span></a><nav aria-label="Navegación principal"><a href="index.html#contenido">Privacidad</a><a href="terms.html#contenido">Condiciones de uso</a><a href="#apartado-10">Contacto</a><a href="index.html#licencias">Licencias</a></nav></div></header>
<div class="page-intro"><p class="eyebrow">Tu escritura. Tus datos.</p><p class="intro-title">Información clara,<br>siempre a tu alcance.</p><p class="intro-copy">Conoce cómo utilizar HiNote Studio, cómo se trata la información y cómo contactar al responsable.</p></div>
<div class="document-layout"><aside class="contents" aria-label="En este documento"><strong>En este documento</strong>'''+links+'''<a href="index.html#licencias"><span>+</span>Componentes y licencias</a><p>También puedes consultar esta información dentro de la app, sin conexión.</p></aside><main id="contenido" class="document">'''+body+licenses+'''</main></div>
<footer><span>HiNote Studio</span><span>Proyecto independiente · México</span><a href="terms.html">Condiciones de uso</a><a href="index.html#apartado-10">Contacto y privacidad</a></footer></body></html>
'''


def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--output-directory', type=Path, required=True)
    args=parser.parse_args()
    args.output_directory.mkdir(parents=True,exist_ok=True)
    assets=ROOT/'HiNote_Studio_Tablet_Android/app/src/main/assets/legal'
    policy=document_body((assets/'privacy.html').read_text())
    terms=document_body((assets/'terms.html').read_text())
    licenses=document_body((assets/'licenses.html').read_text())
    licenses=licenses.replace('<h1>Componentes y licencias</h1>','<h2>Componentes y licencias</h2>').replace('href="privacy.html"','href="#contenido"')
    section='<section id="licencias" aria-label="Componentes y licencias">'+licenses+'</section>'
    public_policy=render_page(policy,'Privacidad',licenses=section)
    for name in ('index.html','privacy.html','licenses.html'):
        (args.output_directory/name).write_text(public_policy)
    (args.output_directory/'terms.html').write_text(render_page(terms,'Condiciones de uso',terms=True))
    print('Public privacy, terms and licenses rendered from the Android legal documents')


if __name__=='__main__':main()
