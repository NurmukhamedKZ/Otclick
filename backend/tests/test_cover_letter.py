import os
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

os.environ.setdefault("SUPABASE_URL", "https://test.supabase.co")
os.environ.setdefault("SUPABASE_ANON_KEY", "test-anon")
os.environ.setdefault("SUPABASE_SERVICE_ROLE_KEY", "test-service")
os.environ.setdefault("FERNET_KEY", "kPpDeJjFqDppkMm6QHzqFkkSgFwsKtGzh4WeZ5dKZHc=")


def _cache_sb(hit_text=None):
    """Mock supabase with cover_letters_cache fluent chain."""
    read_chain = MagicMock()
    read_chain.select.return_value = read_chain
    read_chain.eq.return_value = read_chain
    read_chain.maybe_single.return_value = read_chain
    read_chain.execute.return_value = SimpleNamespace(
        data={"text": hit_text} if hit_text else None
    )

    write_chain = MagicMock()
    write_chain.upsert.return_value = write_chain
    write_chain.execute.return_value = SimpleNamespace(data=None)

    sb = MagicMock()
    sb.table.side_effect = lambda name: read_chain if read_chain.execute.call_count == 0 else write_chain
    return sb, read_chain, write_chain


def test_rand_text_resolves_alternations():
    from app.services.cover_letter import rand_text

    out = rand_text("{Привет|Здравствуйте}, {мир|world}")
    assert out in {"Привет, мир", "Привет, world", "Здравствуйте, мир", "Здравствуйте, world"}


def test_rand_text_nested():
    from app.services.cover_letter import rand_text

    out = rand_text("a {b|{c|d}} e")
    assert out in {"a b e", "a c e", "a d e"}


def test_build_fallback_uses_placeholders():
    from app.services.cover_letter import _build_fallback

    out = _build_fallback(
        {"name": "Go Dev", "employer": {"name": "Acme"}},
        {"title": "Senior Go"},
    )
    assert "Go Dev" in out
    assert "Acme" in out
    assert "Senior Go" in out


async def test_generate_cache_hit_skips_openai():
    from app.services import cover_letter as cl

    sb, _, write = _cache_sb(hit_text="CACHED LETTER")
    fake_client = MagicMock()

    with (
        patch.object(cl, "service_client", sb),
        patch.object(cl, "_get_client", return_value=fake_client),
    ):
        text = await cl.generate(
            user_id="u1",
            vacancy={"id": "v1", "name": "n"},
            resume={"title": "t"},
            resume_uuid="r-uuid",
        )
    assert text == "CACHED LETTER"
    fake_client.complete.assert_not_called()
    write.upsert.assert_not_called()


async def test_generate_calls_openai_and_caches():
    from app.services import cover_letter as cl

    sb, _, write = _cache_sb(hit_text=None)
    fake_client = MagicMock()
    fake_client.complete.return_value = "AI LETTER"

    with (
        patch.object(cl, "service_client", sb),
        patch.object(cl, "_get_client", return_value=fake_client),
    ):
        text = await cl.generate(
            user_id="u1",
            vacancy={"id": "v1", "name": "n", "employer": {"name": "co"}},
            resume={"title": "t"},
            resume_uuid="r-uuid",
        )
    assert text == "AI LETTER"
    fake_client.complete.assert_called_once()
    write.upsert.assert_called_once()
    args, kwargs = write.upsert.call_args
    assert args[0]["source"] == "ai"
    assert args[0]["text"] == "AI LETTER"


async def test_generate_falls_back_when_ai_fails():
    from app.ai import OpenAIError
    from app.services import cover_letter as cl

    sb, _, write = _cache_sb(hit_text=None)
    fake_client = MagicMock()
    fake_client.complete.side_effect = OpenAIError("rate limit")

    with (
        patch.object(cl, "service_client", sb),
        patch.object(cl, "_get_client", return_value=fake_client),
    ):
        text = await cl.generate(
            user_id="u1",
            vacancy={"id": "v1", "name": "Go Dev", "employer": {"name": "Acme"}},
            resume={"title": "Senior Go"},
            resume_uuid="r-uuid",
        )
    assert "Go Dev" in text
    assert "Acme" in text
    write.upsert.assert_called_once()
    assert write.upsert.call_args[0][0]["source"] == "fallback"


async def test_generate_no_api_key_uses_fallback():
    from app.services import cover_letter as cl

    sb, _, write = _cache_sb(hit_text=None)
    with (
        patch.object(cl, "service_client", sb),
        patch.object(cl, "_get_client", return_value=None),
    ):
        text = await cl.generate(
            user_id="u1",
            vacancy={"id": "v1", "name": "Dev", "employer": {"name": "X"}},
            resume={"title": "Mid"},
            resume_uuid="r-uuid",
        )
    assert "Dev" in text
    assert write.upsert.call_args[0][0]["source"] == "fallback"
