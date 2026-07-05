"""
Cloudinary storage for MCQ photos + message/announcement files.

Activates when CLOUDINARY_URL is set (cloudinary://KEY:SECRET@CLOUD_NAME) — otherwise the app
keeps using local-disk storage (dev). Design:

  * Every asset is uploaded as type='authenticated' → NOT publicly reachable. The app keeps its
    own ACLs and PROXIES bytes through the existing /api endpoints via server-signed URLs.
  * Free-plan limit is 10 MB per file, so:
      - oversize IMAGES are recompressed server-side (Pillow, max 3000px JPEG q82), and
      - any other oversize file is transparently SPLIT into <10 MB parts (lossless) and
        re-joined on download. Part ids: <base>.p0, <base>.p1, …
  * public_ids carry NO file extension (Cloudinary blocks some extensions; the real
    name/mime live in our DB and are set on the download response).
"""
import io, os, ssl, urllib.request

ENABLED = bool(os.environ.get('CLOUDINARY_URL'))
MAX_ONE = 9 * 1024 * 1024          # stay safely under the 10 MB free-plan cap

if ENABLED:
    import cloudinary, cloudinary.uploader, cloudinary.utils
    try:
        import certifi
        _CTX = ssl.create_default_context(cafile=certifi.where())
    except Exception:
        _CTX = ssl.create_default_context()

def _signed_url(public_id, resource_type):
    url, _ = cloudinary.utils.cloudinary_url(public_id, resource_type=resource_type,
                                             type='authenticated', sign_url=True, secure=True)
    return url

def _fetch(public_id, resource_type):
    return urllib.request.urlopen(_signed_url(public_id, resource_type), timeout=60, context=_CTX).read()

def _put(data, public_id, resource_type):
    cloudinary.uploader.upload(io.BytesIO(data), public_id=public_id, resource_type=resource_type,
                               type='authenticated', overwrite=True, invalidate=True)

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
    _put(data, 'mcq/photos/' + pid, 'image')
    return 'mcq/photos/' + pid

def get_photo(cloud_id):
    return _fetch(cloud_id, 'image')

def delete_photo(cloud_id):
    try: cloudinary.uploader.destroy(cloud_id, resource_type='image', type='authenticated', invalidate=True)
    except Exception: pass

# ---------- message/announcement files (any type; auto-shrink / auto-split) ----------
def put_file(fid, data, mime):
    """Returns (base_cloud_id, chunk_count, final_size, final_mime).
    Oversize images are recompressed; other oversize files are split losslessly."""
    if len(data) > MAX_ONE and str(mime or '').startswith('image/'):
        try:
            data = _shrink_image(data); mime = 'image/jpeg'
        except Exception:
            pass
    base = 'mcq/files/' + fid
    if len(data) <= MAX_ONE:
        _put(data, base + '.p0', 'raw')
        return base, 1, len(data), mime
    chunks = [data[i:i + MAX_ONE] for i in range(0, len(data), MAX_ONE)]
    for i, part in enumerate(chunks):
        _put(part, base + '.p' + str(i), 'raw')
    return base, len(chunks), len(data), mime

def get_file(base_cloud_id, chunk_count):
    out = b''
    for i in range(max(1, int(chunk_count or 1))):
        out += _fetch(base_cloud_id + '.p' + str(i), 'raw')
    return out

def delete_file(base_cloud_id, chunk_count):
    for i in range(max(1, int(chunk_count or 1))):
        try: cloudinary.uploader.destroy(base_cloud_id + '.p' + str(i), resource_type='raw', type='authenticated', invalidate=True)
        except Exception: pass
