"""Opt-in production smoke test. Creates and removes only its own synthetic accounts.

Run with YINGHUO_ADMIN_TOKEN in the environment. Never use an existing browser session.
"""
import os
import time
import uuid
import json
import subprocess
import tempfile
from pathlib import Path


class HttpResponse:
    def __init__(self, status, headers, body):
        self.status_code = status
        self.headers = headers
        self.text = body.decode('utf-8')

    def json(self):
        return json.loads(self.text)


class Cookies:
    def __init__(self, path):
        self.path = path

    def get_dict(self):
        result = {}
        for line in self.path.read_text().splitlines():
            if line.startswith('#HttpOnly_'):
                line = line[len('#HttpOnly_'):]
            if line and not line.startswith('#'):
                fields = line.split('\t')
                if len(fields) == 7:
                    result[fields[5]] = fields[6]
        return result


class Http:
    def __init__(self):
        self.directory = tempfile.TemporaryDirectory(prefix='yinghuo-smoke-')
        self.cookie_path = Path(self.directory.name) / 'cookies'
        self.cookie_path.touch(mode=0o600)
        self.cookies = Cookies(self.cookie_path)

    def request(self, method, url, json=None, headers=None, timeout=65, cookies=None):
        header_path = Path(self.directory.name) / 'headers'
        body_path = Path(self.directory.name) / 'body'
        limit = max(timeout) if isinstance(timeout, tuple) else timeout
        args = ['curl', '-sS', '--compressed', '--max-time', str(limit),
                '-X', method, '-D', str(header_path), '-o', str(body_path), '-w', '%{http_code}',
                '-b', str(self.cookie_path), '-c', str(self.cookie_path)]
        for key, value in (headers or {}).items():
            args += ['-H', f'{key}: {value}']
        if cookies:
            args += ['-H', 'Cookie: ' + '; '.join(f'{key}={value}' for key, value in cookies.items())]
        data = None
        if json is not None:
            data = __import__('json').dumps(json, ensure_ascii=False)
            args += ['-H', 'Content-Type: application/json', '--data-binary', '@-']
        completed = subprocess.run(args + [url], input=data, text=True, capture_output=True, check=True)
        response_headers = {}
        for line in header_path.read_text().splitlines():
            if line.startswith('HTTP/'):
                response_headers = {}
            elif ': ' in line:
                key, value = line.split(': ', 1)
                response_headers[key.lower()] = value
        return HttpResponse(int(completed.stdout), response_headers, body_path.read_bytes())

    def get(self, url, **kwargs):
        return self.request('GET', url, **kwargs)

    def patch(self, url, **kwargs):
        return self.request('PATCH', url, **kwargs)


http = Http()
ROOT = os.getenv('YINGHUO_TEST_URL', 'https://yinghuo.soocly.com').rstrip('/')
ADMIN = os.environ['YINGHUO_ADMIN_TOKEN']


class Client:
    def __init__(self):
        self.http = Http()
        self.csrf = None
        self.user_id = None

    def call(self, method, path, data=None, expected=200):
        headers = {'Origin': ROOT}
        if self.csrf:
            headers['X-CSRF-Token'] = self.csrf
        response = self.http.request(method, ROOT + '/api/v1' + path,
                                     json=data if data is not None else ({} if method != 'GET' else None),
                                     headers=headers, timeout=(20, 65))
        assert response.status_code == expected, (method, path, response.status_code, response.text[:300])
        result = response.json()
        if isinstance(result, dict) and result.get('csrfToken'):
            self.csrf = result['csrfToken']
        if path == '/auth/guest':
            self.user_id = result['userId']
        return result, response

    def create(self, label):
        self.call('POST', '/auth/guest')
        return self.call('POST', '/profiles', {
            'name': label, 'relationship': '亲人', 'nickname': label,
            'callMe': '验证者', 'story': '部署测试合成数据：曾一起在公园散步。', 'aiConsent': True,
        })[0]


a, b = Client(), Client()
try:
    started = time.monotonic()
    home = http.get(ROOT + '/', timeout=30)
    assert home.status_code == 200 and home.headers.get('x-yinghuo-release') == '20261008-square10'
    assert 'boot-shell' in home.text
    print('PASS deployed home shell', round(time.monotonic() - started, 2), 'seconds', flush=True)
    assert http.get(ROOT + '/admin', timeout=30).headers.get('x-robots-tag') == 'noindex, nofollow'
    assert a.call('GET', '/app-state')[0]['session']['userId'] is None
    assert a.call('GET', '/health')[0]['status'] == 'ok'
    a.call('GET', '/admin/stories', expected=401)
    p = a.create('上线验证甲')
    memory = a.call('POST', '/profiles/' + p['id'] + '/memories', {
        'title': '公园散步', 'body': '曾一起在公园散步，聊起下一次想去的地方。', 'useForAi': True,
    })[0]
    state = a.call('GET', '/app-state?includeMessages=1&includePosts=1')[0]
    assert state['currentProfileId'] == p['id'] and len(state['memories']) == 2
    recovery = a.call('POST', '/auth/recovery-code')[0]
    chat, response = a.call('POST', '/profiles/' + p['id'] + '/messages', {
        'text': '今天想起那次公园散步，能帮我为这段回忆想个小标题吗？',
        'aiConsent': True, 'memoryIds': [memory['id']], 'clientMessageId': str(uuid.uuid4()),
    })
    assert len(chat['items']) == 2 and chat['items'][1]['mock'] is False and len(chat['items'][1]['text']) > 0
    print('PASS real AI reply; provider:', response.headers.get('x-yinghuo-ai-bridge', 'workers-ai'), flush=True)
    a.call('POST', '/profiles/' + p['id'] + '/messages', {
        'text': '现在我想聊聊今天的心情。', 'aiConsent': True,
        'memoryIds': [], 'clientMessageId': str(uuid.uuid4()),
    })
    export = a.call('GET', '/account/export')[0]
    assert len(export['messages']) == 4
    assert any(m['status'] == 'context_excluded' for m in export['messages'])
    assert all(key in export for key in ['profileAvatars', 'profilePreferences', 'consents', 'feedback'])
    print('PASS complete export and removed memory excluded from AI history', flush=True)
    a.call('POST', '/profiles/' + p['id'] + '/messages/reset')
    assert a.call('GET', '/profiles/' + p['id'] + '/messages')[0]['items'] == []
    assert len(a.call('GET', '/account/export')[0]['messages']) == 4
    print('PASS transactional conversation reset with export preserved', flush=True)
    post = a.call('POST', '/square', {
        'title': '上线审核验证', 'body': '部署验证合成数据，不应发布。',
        'visibility': 'public', 'publicConsent': True,
    })[0]
    assert post['moderation'] == 'pending'
    admin_headers = {'Authorization': 'Bearer ' + ADMIN, 'Origin': ROOT}
    queue = http.get(ROOT + '/api/v1/admin/stories', headers=admin_headers, timeout=30)
    assert queue.status_code == 200 and any(x['id'] == post['id'] for x in queue.json()['items'])
    review = http.patch(ROOT + '/api/v1/admin/stories/' + post['id'], headers=admin_headers,
                            json={'decision': 'rejected', 'reason': '上线验证合成数据'}, timeout=30)
    assert review.status_code == 200 and review.json()['moderation'] == 'rejected'
    own = a.call('GET', '/square?view=mine')[0]['items']
    assert any(x['id'] == post['id'] and x['moderationReason'] == '上线验证合成数据' for x in own)
    print('PASS protected review queue and visible rejection reason', flush=True)
    pb = b.create('上线验证乙')
    source_cookie = b.http.cookies.get_dict()
    merged = b.call('POST', '/auth/recover', {
        'familyCode': recovery['familyCode'], 'recoveryCode': recovery['recoveryCode'], 'mergeGuest': True,
    })[0]
    assert merged['merged'] is True and merged['userId'] == a.user_id
    merged_state = b.call('GET', '/app-state?profileId=' + pb['id'])[0]
    assert len(merged_state['profiles']) == 2 and merged_state['currentProfileId'] == pb['id']
    old = http.get(ROOT + '/api/v1/auth/session', cookies=source_cookie, timeout=30)
    assert old.json()['userId'] is None
    print('PASS cross-device recovery and lossless guest merge; old guest session revoked', flush=True)
    b.call('DELETE', '/profiles/' + pb['id'])
    b.call('DELETE', '/profiles/' + p['id'])
    after_delete = b.call('GET', '/app-state')[0]
    assert not after_delete['profiles'] and after_delete['bootstrap']['canCreateFreeProfile']
    print('PASS profile deletion and free-space replacement', flush=True)
finally:
    # Account UUIDs are obtained only from new sessions created above.
    for client in [b, a]:
        if client.user_id:
            try:
                session = client.call('GET', '/auth/session')[0]
                if session.get('userId'):
                    client.csrf = session['csrfToken']
                    client.call('POST', '/account/delete', {'confirmation': '永久删除'})
                    print('Removed synthetic smoke-test account', flush=True)
            except Exception as error:
                print('Synthetic cleanup needs follow-up:', str(error)[:250], flush=True)
