"""AI calls — Claude (Anthropic).

The key lives ONLY on the server: ANTHROPIC_API_KEY in the Render environment (the repo
is public). Model: Claude Haiku 5.5 — the cheapest Claude, plenty for reading a fridge
display, a product label or a handwritten delivery note. Override with CLAUDE_MODEL.

Every function returns (text, error): exactly one is None. Callers never see an
exception from here — a failed read must fall back to typing it in by hand, never
break the page.
"""
import base64
import io
import os

MODEL = os.environ.get('CLAUDE_MODEL') or 'claude-haiku-5-5'

_MEDIA = ('image/jpeg', 'image/png', 'image/gif', 'image/webp')
_MAX_BYTES = 3_500_000      # the API caps one image at 5 MB; base64 adds a third
_MAX_SIDE = 2000            # enough for handwriting; the model downsizes beyond this anyway

_client = None


def configured():
    return bool(os.environ.get('ANTHROPIC_API_KEY'))


def _get_client():
    global _client
    if _client is None:
        import anthropic
        # gunicorn kills a request at 120 s: 50 s x (1 try + 1 retry) stays inside it
        _client = anthropic.Anthropic(timeout=50.0, max_retries=1)
    return _client


def prepare_image(data, mime):
    """Photo bytes -> (bytes, media_type) the API accepts. Phone photos are often too big,
    sideways (EXIF rotation the model would not apply) or in a format it cannot take, so
    those are re-encoded as an upright JPEG. Anything already fine is sent untouched."""
    mime = (mime or '').lower().split(';')[0].strip()
    if mime == 'image/jpg':
        mime = 'image/jpeg'
    redo = mime not in _MEDIA or len(data) > _MAX_BYTES
    try:
        from PIL import Image, ImageOps
        im = Image.open(io.BytesIO(data))
        rotated = False
        try:
            rotated = (im.getexif().get(0x0112) or 1) != 1
        except Exception:
            pass
        if not (redo or rotated or max(im.size) > _MAX_SIDE + 400):
            return data, mime
        im = ImageOps.exif_transpose(im)
        if im.mode not in ('RGB', 'L'):
            im = im.convert('RGB')
        im.thumbnail((_MAX_SIDE, _MAX_SIDE))
        out = io.BytesIO()
        im.save(out, 'JPEG', quality=88, optimize=True)
        return out.getvalue(), 'image/jpeg'
    except Exception:
        if redo:
            raise ValueError('unsupported photo format')
        return data, mime


def _text_of(resp):
    if resp.stop_reason == 'refusal':
        return None, 'the AI declined to read this'
    text = ''.join(b.text for b in resp.content if b.type == 'text').strip()
    if not text:
        return None, 'the AI returned nothing' + (' (cut off)' if resp.stop_reason == 'max_tokens' else '')
    return text, None


def _create(**kw):
    if not configured():
        return None, 'ANTHROPIC_API_KEY not set on the server'
    import anthropic
    try:
        resp = _get_client().messages.create(model=MODEL, **kw)
    except anthropic.RateLimitError:
        return None, 'the AI is busy — try again in a minute'
    except anthropic.APIStatusError as e:
        return None, 'claude %s %s' % (e.status_code, str(getattr(e, 'message', e))[:160])
    except anthropic.APIConnectionError:
        return None, 'could not reach the AI service'
    except Exception as e:      # never let an AI hiccup take a request down
        return None, str(e)[:160]
    return _text_of(resp)


def vision(image_bytes, mime, prompt, effort='low', max_tokens=8000):
    """Ask about one photo. `effort` trades thoroughness for tokens: 'low' for a display
    or a label, 'medium' for handwriting where every digit is money."""
    try:
        data, media = prepare_image(image_bytes, mime)
    except ValueError:
        return None, 'unsupported photo format — take the photo as JPEG or PNG'
    b64 = base64.standard_b64encode(data).decode('ascii')
    return _create(max_tokens=max_tokens, output_config={'effort': effort},
                   messages=[{'role': 'user', 'content': [
                       {'type': 'image', 'source': {'type': 'base64', 'media_type': media, 'data': b64}},
                       {'type': 'text', 'text': prompt}]}])


def chat(messages, effort='low', max_tokens=8000):
    """Chat-style call. Accepts the {'role': 'system'|'user'|'assistant'} list the app
    already builds; system turns become the system prompt."""
    system = '\n\n'.join(str(m.get('content') or '') for m in messages if m.get('role') == 'system')
    convo = [{'role': m['role'], 'content': m.get('content') or ''}
             for m in messages if m.get('role') in ('user', 'assistant')]
    kw = {'max_tokens': max_tokens, 'output_config': {'effort': effort}, 'messages': convo}
    if system:
        kw['system'] = system
    return _create(**kw)
