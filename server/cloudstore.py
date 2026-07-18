"""
Cloud storage for MCQ photos + message/announcement files.

Primary backend is ImageKit.io (private files + server-signed delivery URLs). Cloudinary is kept
as a READ/DELETE fallback for assets uploaded BEFORE the migration (dual-read): any stored cloud
id that is NOT prefixed 'ik|' is treated as a legacy Cloudinary public_id.

Config (env only — NEVER hardcode; the repo is public):
  IMAGEKIT_URL_ENDPOINT, IMAGEKIT_PUBLIC_KEY, IMAGEKIT_PRIVATE_KEY  -> ImageKit (new uploads)
  CLOUDINARY_URL                                                    -> Cloudinary (legacy reads)

Design carried over from the Cloudinary version:
  * Assets are PRIVATE; the app proxies bytes through its own authed /api endpoints via signed
    (short-lived) URLs — nothing is publicly reachable.
  * <=9 MB per stored part: oversize IMAGES are recompressed (Pillow), any other oversize file is
    SPLIT losslessly into .p0/.p1/… parts and rejoined on download.
  * The stored cloud id for ImageKit encodes what delete needs (fileId) AND what fetch needs (url):
      photo : 'ik|<fileId>|<deliveryUrl>'
      file  : 'ik|<fileId0>,<fileId1>,…|<url0>,<url1>,…'
    Legacy Cloudinary ids keep their old shape: 'mcq/photos/<pid>' / 'mcq/files/<fid>'.
"""
import io, os, ssl, time, hmac, hashlib, json, uuid, base64, urllib.request

IK_ENDPOINT = (os.environ.get('IMAGEKIT_URL_ENDPOINT') or '').rstrip('/')
IK_PUBLIC   = os.environ.get('IMAGEKIT_PUBLIC_KEY') or ''
IK_PRIVATE  = os.environ.get('IMAGEKIT_PRIVATE_KEY') or ''
IK_ENABLED  = bool(IK_ENDPOINT and IK_PRIVATE)

CLOUDINARY_ENABLED = bool(os.environ.get('CLOUDINARY_URL'))
ENABLED = IK_ENABLED or CLOUDINARY_ENABLED
MAX_ONE = 9 * 1024 * 1024          # stay safely under provider per-file caps

try:
    import certifi
    _CTX = ssl.create_default_context(cafile=certifi.where())
except Exception:
    _CTX = ssl.create_default_context()

if CLOUDINARY_ENABLED:
    import cloudinary, cloudinary.uploader, cloudinary.utils

# ---------- ImageKit low-level ----------
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
    return urllib.request.urlopen(_ik_signed(url), timeout=60, context=_CTX).read()

def _ik_delete(file_id):
    req = urllib.request.Request(_IK_FILES + file_id, headers={'Authorization': _ik_auth()}, method='DELETE')
    try: urllib.request.urlopen(req, timeout=30, context=_CTX).read()
    except Exception: pass

# ---------- Cloudinary low-level (legacy read/delete) ----------
def _cld_signed(public_id, rt):
    url, _ = cloudinary.utils.cloudinary_url(public_id, resource_type=rt,
                                             type='authenticated', sign_url=True, secure=True)
    return url

def _cld_fetch(public_id, rt):
    if not CLOUDINARY_ENABLED:
        raise RuntimeError('legacy Cloudinary asset but CLOUDINARY_URL is not set: ' + str(public_id))
    return urllib.request.urlopen(_cld_signed(public_id, rt), timeout=60, context=_CTX).read()

def _cld_put(data, public_id, rt):
    cloudinary.uploader.upload(io.BytesIO(data), public_id=public_id, resource_type=rt,
                               type='authenticated', overwrite=True, invalidate=True)

def _cld_destroy(public_id, rt):
    if not CLOUDINARY_ENABLED: return          # nothing we can (or need to) delete
    try: cloudinary.uploader.destroy(public_id, resource_type=rt, type='authenticated', invalidate=True)
    except Exception: pass

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
    if IK_ENABLED:
        fid, url = _ik_upload(data, '/mcq/photos', pid)
        return 'ik|' + fid + '|' + url
    _cld_put(data, 'mcq/photos/' + pid, 'image')
    return 'mcq/photos/' + pid

def get_photo(cloud_id):
    if cloud_id and cloud_id.startswith('ik|'):
        _, _fid, url = cloud_id.split('|', 2)
        return _ik_fetch(url)
    return _cld_fetch(cloud_id, 'image')

def delete_photo(cloud_id):
    if cloud_id and cloud_id.startswith('ik|'):
        _, fid, _url = cloud_id.split('|', 2)
        _ik_delete(fid); return
    _cld_destroy(cloud_id, 'image')

# ---------- message/announcement files (any type; auto-shrink / auto-split) ----------
def put_file(fid, data, mime):
    """Returns (base_cloud_id, chunk_count, final_size, final_mime).
    Oversize images are recompressed; other oversize files are split losslessly."""
    if len(data) > MAX_ONE and str(mime or '').startswith('image/'):
        try: data = _shrink_image(data); mime = 'image/jpeg'
        except Exception: pass
    parts = [data] if len(data) <= MAX_ONE else [data[i:i + MAX_ONE] for i in range(0, len(data), MAX_ONE)]
    if IK_ENABLED:
        fids, urls = [], []
        for i, part in enumerate(parts):
            f, u = _ik_upload(part, '/mcq/files', fid + '.p' + str(i))
            fids.append(f); urls.append(u)
        return 'ik|' + ','.join(fids) + '|' + ','.join(urls), len(parts), len(data), mime
    base = 'mcq/files/' + fid
    for i, part in enumerate(parts):
        _cld_put(part, base + '.p' + str(i), 'raw')
    return base, len(parts), len(data), mime

def get_file(base_cloud_id, chunk_count):
    if base_cloud_id and base_cloud_id.startswith('ik|'):
        _, _fids, urls = base_cloud_id.split('|', 2)
        return b''.join(_ik_fetch(u) for u in urls.split(','))
    out = b''
    for i in range(max(1, int(chunk_count or 1))):
        out += _cld_fetch(base_cloud_id + '.p' + str(i), 'raw')
    return out

def delete_file(base_cloud_id, chunk_count):
    if base_cloud_id and base_cloud_id.startswith('ik|'):
        _, fids, _urls = base_cloud_id.split('|', 2)
        for f in fids.split(','):
            if f: _ik_delete(f)
        return
    for i in range(max(1, int(chunk_count or 1))):
        _cld_destroy(base_cloud_id + '.p' + str(i), 'raw')
