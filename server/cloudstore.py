"""
Cloud storage for MCQ photos + message/announcement files — ImageKit.io.

Config (env only — NEVER hardcode; the repo is public):
  IMAGEKIT_URL_ENDPOINT, IMAGEKIT_PUBLIC_KEY, IMAGEKIT_PRIVATE_KEY

Design:
  * Assets are PRIVATE files; the app proxies bytes through its own authed /api endpoints via
    short-lived server-signed URLs — nothing is publicly reachable.
  * Every fetch adds tr=orig-true: without it ImageKit's delivery optimization RE-ENCODES
    images (smaller but lower quality). We always serve the original bytes.
  * <=9 MB per stored part: oversize IMAGES are recompressed (Pillow), any other oversize file
    is SPLIT losslessly into .p0/.p1/… parts and rejoined on download.
  * The stored cloud id encodes what delete needs (fileId) AND what fetch needs (url):
      photo : 'ik|<fileId>|<deliveryUrl>'
      file  : 'ik|<fileId0>,<fileId1>,…|<url0>,<url1>,…'
    (Cloudinary-era ids without the 'ik|' prefix no longer exist — that account was
    emptied and closed on 2026-07-19; a stray legacy id raises a clean error.)
"""
import io, os, ssl, time, hmac, hashlib, json, uuid, base64, urllib.request

IK_ENDPOINT = (os.environ.get('IMAGEKIT_URL_ENDPOINT') or '').rstrip('/')
IK_PUBLIC   = os.environ.get('IMAGEKIT_PUBLIC_KEY') or ''
IK_PRIVATE  = os.environ.get('IMAGEKIT_PRIVATE_KEY') or ''
IK_ENABLED  = bool(IK_ENDPOINT and IK_PRIVATE)
ENABLED     = IK_ENABLED
MAX_ONE = 9 * 1024 * 1024          # stay safely under provider per-file caps

try:
    import certifi
    _CTX = ssl.create_default_context(cafile=certifi.where())
except Exception:
    _CTX = ssl.create_default_context()

_IK_UPLOAD = 'https://upload.imagekit.io/api/v1/files/upload'
_IK_FILES  = 'https://api.imagekit.io/v1/files/'

def _ik_auth():
    return 'Basic ' + base64.b64encode((IK_PRIVATE + ':').encode()).decode()

def _ik_upload(data, folder, file_name):
    """Upload one private part; returns (fileId, deliveryUrl)."""
    b = '----mcq' + uuid.uuid4().hex
    def fld(n, v):
        return ('--' + b + '\r\nContent-Disposition: form-data; name="' + n + '"\r\n\r\n' + v + '\r\n').encode()
    body  = fld('fileName', file_name) + fld('folder', folder)
    body += fld('isPrivateFile', 'true') + fld('useUniqueFileName', 'false') + fld('overwrite', 'true')
    body += ('--' + b + '\r\nContent-Disposition: form-data; name="file"; filename="' + file_name + '"\r\n'
             'Content-Type: application/octet-stream\r\n\r\n').encode() + data + ('\r\n--' + b + '--\r\n').encode()
    req = urllib.request.Request(_IK_UPLOAD, data=body, method='POST',
        headers={'Authorization': _ik_auth(), 'Content-Type': 'multipart/form-data; boundary=' + b})
    with urllib.request.urlopen(req, timeout=120, context=_CTX) as r:
        j = json.loads(r.read())
    return j['fileId'], j['url']

def _ik_signed(url, ttl=3600):
    """ImageKit private-file signature: HMAC-SHA1(private, path_after_endpoint + expiry)."""
    exp = int(time.time()) + ttl
    path = url.replace(IK_ENDPOINT + '/', '', 1)
    sig = hmac.new(IK_PRIVATE.encode(), (path + str(exp)).encode(), hashlib.sha1).hexdigest()
    return url + ('&' if '?' in url else '?') + 'ik-t=' + str(exp) + '&ik-s=' + sig

def _ik_fetch(url):
    # tr=orig-true: bypass ImageKit's default delivery optimization and return the ORIGINAL
    # bytes — without it images come back re-encoded (smaller AND lower quality).
    return urllib.request.urlopen(_ik_signed(url + ('&' if '?' in url else '?') + 'tr=orig-true'),
                                  timeout=60, context=_CTX).read()

def _ik_delete(file_id):
    req = urllib.request.Request(_IK_FILES + file_id, headers={'Authorization': _ik_auth()}, method='DELETE')
    try: urllib.request.urlopen(req, timeout=30, context=_CTX).read()
    except Exception: pass

def _ik_parts(cloud_id):
    """'ik|fids|urls' -> (list of fileIds, list of urls); raises on a non-ImageKit id."""
    if not (cloud_id and cloud_id.startswith('ik|')):
        raise RuntimeError('not an ImageKit cloud id: ' + str(cloud_id))
    _, fids, urls = cloud_id.split('|', 2)
    return [f for f in fids.split(',') if f], [u for u in urls.split(',') if u]

def _shrink_image(data):
    """Recompress an oversize image (attachment path) to fit the per-file cap."""
    from PIL import Image
    im = Image.open(io.BytesIO(data))
    if im.mode not in ('RGB', 'L'): im = im.convert('RGB')
    im.thumbnail((3000, 3000))
    out = io.BytesIO()
    im.save(out, 'JPEG', quality=82, optimize=True)
    return out.getvalue()

# ---------- photos (already client-compressed; always a single asset) ----------
def put_photo(pid, data):
    fid, url = _ik_upload(data, '/mcq/photos', pid)
    return 'ik|' + fid + '|' + url

def get_photo(cloud_id):
    _fids, urls = _ik_parts(cloud_id)
    return _ik_fetch(urls[0])

def delete_photo(cloud_id):
    try: fids, _urls = _ik_parts(cloud_id)
    except Exception: return
    for f in fids: _ik_delete(f)

# ---------- message/announcement files (any type; auto-shrink / auto-split) ----------
def put_file(fid, data, mime):
    """Returns (base_cloud_id, chunk_count, final_size, final_mime).
    Oversize images are recompressed; other oversize files are split losslessly."""
    if len(data) > MAX_ONE and str(mime or '').startswith('image/'):
        try: data = _shrink_image(data); mime = 'image/jpeg'
        except Exception: pass
    parts = [data] if len(data) <= MAX_ONE else [data[i:i + MAX_ONE] for i in range(0, len(data), MAX_ONE)]
    fids, urls = [], []
    for i, part in enumerate(parts):
        f, u = _ik_upload(part, '/mcq/files', fid + '.p' + str(i))
        fids.append(f); urls.append(u)
    return 'ik|' + ','.join(fids) + '|' + ','.join(urls), len(parts), len(data), mime

def get_file(base_cloud_id, chunk_count):
    _fids, urls = _ik_parts(base_cloud_id)
    return b''.join(_ik_fetch(u) for u in urls)

def delete_file(base_cloud_id, chunk_count):
    try: fids, _urls = _ik_parts(base_cloud_id)
    except Exception: return
    for f in fids: _ik_delete(f)
