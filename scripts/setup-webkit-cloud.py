"""Prepare pinned WebKit on the managed Debian 13 cloud without root.

Use the platform's Debian snapshot sources, signatures and package checksums.
Only public source metadata and libraries are written, entirely under .cache.
"""
from pathlib import Path
import os
import subprocess
from urllib.parse import urlsplit

root = Path(__file__).resolve().parent.parent
cache = root / '.cache'
source = Path('/etc/apt/sources.list.d/caas-snapshot.list')
if not source.exists():
    raise SystemExit('This helper requires the managed Debian snapshot; use playwright install --with-deps on other hosts')
for name in ['apt-conf', 'apt-lists/partial', 'apt-cache/archives/partial', 'apt-sources', 'webkit-packages', 'webkit-libs', 'logs']:
    (cache / name).mkdir(parents=True, exist_ok=True)
sources = source.read_text()
for part in sources.split():
    if part.startswith(('http://', 'https://')):
        url = urlsplit(part)
        if url.username or url.password:
            raise SystemExit('Credential-bearing APT sources are not copied')
(cache / 'apt-sources/snapshot.list').write_text(sources.replace('http://', 'https://'))
config = cache / 'apt.conf'
config.write_text('\n'.join([
    f'Dir::Etc::Parts "{cache / "apt-conf"}";',
    'Dir::Etc::sourcelist "/dev/null";',
    f'Dir::Etc::sourceparts "{cache / "apt-sources"}";',
    f'Dir::State::lists "{cache / "apt-lists"}";',
    f'Dir::Cache "{cache / "apt-cache"}";',
]))
env = dict(os.environ, APT_CONFIG=str(config))
packages = ['libgtk-4-1', 'libgraphene-1.0-0', 'libharfbuzz-icu0', 'libmanette-0.2-0',
            'libhyphen0', 'libgles2', 'libcairo-script-interpreter2', 'libhidapi-hidraw0',
            'libglvnd0', 'liblzo2-2']
with (cache / 'logs/webkit-cloud-packages.log').open('w') as log:
    subprocess.run(['apt-get', 'update'], env=env, stdout=log, stderr=log, check=True)
    subprocess.run(['apt-get', 'download', *packages], cwd=cache / 'webkit-packages', env=env, stdout=log, stderr=log, check=True)
    for package in (cache / 'webkit-packages').glob('*.deb'):
        subprocess.run(['dpkg-deb', '-x', str(package), str(cache / 'webkit-libs')], stdout=log, stderr=log, check=True)
probe = """
const {webkit}=await import('@playwright/test');
const {cloudWebkitOptions}=await import('./scripts/webkit-cloud.ts');
const browser=await webkit.launch(cloudWebkitOptions());
try { const page=await browser.newPage(); await page.setContent('<title>WebKit readiness</title>');
if(await page.title()!=='WebKit readiness') throw new Error('WebKit smoke failed');
console.log(JSON.stringify({webkit:await browser.version(),ready:true}));
} finally { await browser.close(); }
"""
browser_env = dict(os.environ)
browser_env.setdefault('PLAYWRIGHT_BROWSERS_PATH', str(root.parent / '.cache/ms-playwright'))
subprocess.run(['node', '--use-env-proxy', '--import', 'tsx', '--input-type=module', '-e', probe],
               cwd=root, env=browser_env, check=True)
