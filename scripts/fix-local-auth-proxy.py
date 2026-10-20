"""Keep GoTrue's template fetches on the local Docker network.

Only the exact local Kong hostname is added to existing proxy exclusions.
External proxy/CA settings and all container configuration stay intact.
Container credentials are kept in memory and never logged or written to disk.
"""
import http.client
import json
import socket


class Docker(http.client.HTTPConnection):
    def connect(self):
        self.sock = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
        self.sock.settimeout(30)
        self.sock.connect('/var/run/docker.sock')


def request(method, path, body=None, optional=False):
    conn = Docker('localhost', timeout=30)
    conn.request(method, path, body=None if body is None else json.dumps(body),
                 headers={'Content-Type': 'application/json'})
    response = conn.getresponse()
    data = response.read()
    status = response.status
    conn.close()
    if optional and status == 404:
        return None
    if status >= 300:
        raise RuntimeError('Local Auth container operation failed')
    return json.loads(data) if data else {}


def main():
    name = 'supabase_auth_Nextapp'
    info = request('GET', '/containers/' + name + '/json', optional=True)
    if not info:
        return
    config = info['Config']
    original_env = config.get('Env', [])
    if not any(v.lower().startswith(('http_proxy=', 'https_proxy=')) for v in original_env):
        return
    target = 'supabase_kong_Nextapp'
    exclusions = {v.split('=', 1)[0]: v.split('=', 1)[1] for v in original_env
                  if v.split('=', 1)[0] in ('NO_PROXY', 'no_proxy')}
    if all(target in exclusions.get(k, '').split(',') for k in ('NO_PROXY', 'no_proxy')):
        return
    if set(info['NetworkSettings']['Networks']) != {'supabase_network_Nextapp'}:
        raise RuntimeError('Unexpected local Auth network; no change made')
    updated = [v for v in original_env if v.split('=', 1)[0] not in ('NO_PROXY', 'no_proxy')]
    for key in ('NO_PROXY', 'no_proxy'):
        current = exclusions.get(key, exclusions.get('NO_PROXY', exclusions.get('no_proxy', '')))
        updated.append(key + '=' + ','.join(dict.fromkeys([*filter(None, current.split(',')), target])))
    payload = dict(config)
    payload['HostConfig'] = info['HostConfig']
    payload['NetworkingConfig'] = {'EndpointsConfig': {
        network: {'Aliases': [name, *[a for a in settings.get('Aliases', []) if a != info['Id'][:12]]]}
        for network, settings in info['NetworkSettings']['Networks'].items()
    }}
    request('DELETE', '/containers/' + name + '?force=true')
    try:
        payload['Env'] = updated
        request('POST', '/containers/create?name=' + name, payload)
        request('POST', '/containers/' + name + '/start')
    except Exception:
        request('DELETE', '/containers/' + name + '?force=true', optional=True)
        payload['Env'] = original_env
        request('POST', '/containers/create?name=' + name, payload)
        request('POST', '/containers/' + name + '/start')
        raise RuntimeError('Local Auth proxy update failed; previous configuration restored') from None
    print('Local Auth: internal template access corrected; external proxy preserved')


if __name__ == '__main__':
    try:
        main()
    except Exception:
        raise SystemExit('Cannot configure local Auth template access; no credentials logged') from None
