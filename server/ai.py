"""AI calls — Claude (Anthropic).

The key lives ONLY on the server: ANTHROPIC_API_KEY in the Render environment (the repo
is public). Two models:
  MODEL         Claude Haiku 5.5 — cheap; a fridge display, a product label, the assistant.
  STRONG_MODEL  Claude Opus 5.5  — handwriting, where every digit is money (delivery notes).
Override with CLAUDE_MODEL / CLAUDE_STRONG_MODEL.

Every function returns (text, error): exactly one is None. Callers never see an
exception from here — a failed read must fall back to typing it in by hand, never
break the page.
"""
import base64
import io
import os

MODEL = os.environ.get('CLAUDE_MODEL') or 'claude-haiku-5-5'
STRONG_MODEL = os.environ.get('CLAUDE_STRONG_MODEL') or 'claude-opus-5-5'
# Opus may decline a request it misjudges (a safety classifier false positive). With this
# opt-in the API retries it on the model Anthropic recommends instead of failing the read.
_FALLBACK_BETA = 'server-side-fallback-2026-07-01'
_FALLBACK_MODELS = ('claude-opus-5-5', 'claude-sonnet-5-5')

_MEDIA = ('image/jpeg', 'image/png', 'image/gif', 'image/webp')
_MAX_BYTES = 3_500_000      # the API caps one image at 5 MB; base64 adds a third
_MAX_SIDE = 2000            # enough for handwriting; Haiku downsizes beyond this anyway
STRONG_SIDE = 2576          # Opus reads up to 2576px on the long edge

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


def prepare_image(data, mime, max_side=_MAX_SIDE):
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
        if not (redo or rotated or max(im.size) > max_side + 400):
            return data, mime
        im = ImageOps.exif_transpose(im)
        if im.mode not in ('RGB', 'L'):
            im = im.convert('RGB')
        im.thumbnail((max_side, max_side))
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


def _create(model=None, timeout=None, **kw):
    if not configured():
        return None, 'ANTHROPIC_API_KEY not set on the server'
    import anthropic
    model = model or MODEL
    try:
        client = _get_client()
        if timeout:
            client = client.with_options(timeout=timeout)
        if model in _FALLBACK_MODELS:
            resp = client.beta.messages.create(model=model, betas=[_FALLBACK_BETA], fallbacks='default', **kw)
        else:
            resp = client.messages.create(model=model, **kw)
    except anthropic.RateLimitError:
        return None, 'the AI is busy — try again in a minute'
    except anthropic.APIStatusError as e:
        return None, 'claude %s %s' % (e.status_code, str(getattr(e, 'message', e))[:160])
    except anthropic.APIConnectionError:
        return None, 'could not reach the AI service'
    except Exception as e:      # never let an AI hiccup take a request down
        return None, str(e)[:160]
    return _text_of(resp)


def vision(image_bytes, mime, prompt, effort='low', max_tokens=8000, model=None):
    """Ask about one photo. `effort` trades thoroughness for tokens: 'low' for a display
    or a label, 'high' with STRONG_MODEL for handwriting where every digit is money."""
    strong = bool(model) and model != MODEL
    try:
        data, media = prepare_image(image_bytes, mime, STRONG_SIDE if strong else _MAX_SIDE)
    except ValueError:
        return None, 'unsupported photo format — take the photo as JPEG or PNG'
    b64 = base64.standard_b64encode(data).decode('ascii')
    # a careful read of handwriting takes longer: room for thinking plus the answer, and a
    # longer wait (the SDK retries once on a dropped connection)
    extra = ({'model': model, 'timeout': 100.0, 'max_tokens': max(max_tokens, 16000)} if strong
             else {'max_tokens': max_tokens})
    return _create(output_config={'effort': effort}, **extra,
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
