import time
import urllib.error
import urllib.request

from prometheus_client import Gauge, start_http_server

UP = Gauge('site_up', '1 if the site returned a 2xx response', ['url'])
LATENCY = Gauge('site_response_seconds', 'Response time in seconds', ['url'])
STATUS = Gauge('site_http_status_code', 'Last HTTP status code (0 = no response)', ['url'])

URLS = ['http://localhost/', 'https://example.com']


def probe(url):
    start = time.time()
    code = 0
    try:
        with urllib.request.urlopen(url, timeout=5) as resp:
            code = resp.status
    except urllib.error.HTTPError as err:
        code = err.code
    except Exception:
        code = 0
    UP.labels(url).set(1 if 200 <= code < 300 else 0)
    LATENCY.labels(url).set(time.time() - start)
    STATUS.labels(url).set(code)


if __name__ == '__main__':
    start_http_server(9877, addr='127.0.0.1')
    while True:
        for u in URLS:
            probe(u)
        time.sleep(15)
