"""Require the public legal URLs to serve documents directly, without redirects."""
import json
from pathlib import Path
import urllib.request

ROOT=Path(__file__).resolve().parents[2]


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, request, response, code, message, headers, new_url):
        return None


def main():
    publisher=json.loads((ROOT/'distribution/publisher.json').read_text())
    opener=urllib.request.build_opener(NoRedirect)
    for kind,title in (('policy','Política de privacidad de HiNote Studio'),('terms','Condiciones de uso de HiNote Studio')):
        url=publisher[kind+'_url']
        assert url.startswith('https://victor55101.github.io/HiNote-Studio-Tablet/')
        with opener.open(url,timeout=30) as response:
            document=response.read().decode('utf-8')
            assert response.status==200 and response.url==url
            assert title in document and publisher[kind+'_version'] in document
            assert 'chatgpt.site' not in document
            print(f'{kind}: HTTP 200, direct URL, document date verified: {url}')


if __name__=='__main__':main()
