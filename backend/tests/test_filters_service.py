import os

os.environ.setdefault("SUPABASE_URL", "https://test.supabase.co")
os.environ.setdefault("SUPABASE_ANON_KEY", "test-anon")
os.environ.setdefault("SUPABASE_SERVICE_ROLE_KEY", "test-service")
os.environ.setdefault("FERNET_KEY", "kPpDeJjFqDppkMm6QHzqFkkSgFwsKtGzh4WeZ5dKZHc=")


def test_filter_to_search_params_full():
    from app.services.filters_service import PREVIEW_PER_PAGE, _filter_to_search_params

    params = _filter_to_search_params({
        "text": "python backend",
        "area": 40,
        "salary_min": 500000,
        "experience": "between1And3",
        "schedule": "remote",
        "employment": "full",
        "professional_role": [96, 124],
    })
    assert params["text"] == "python backend"
    assert params["area"] == 40
    assert params["salary"] == 500000
    assert params["only_with_salary"] == "true"
    assert params["experience"] == "between1And3"
    assert params["schedule"] == "remote"
    assert params["employment"] == "full"
    assert params["professional_role"] == [96, 124]
    assert params["per_page"] == PREVIEW_PER_PAGE


def test_filter_to_search_params_skips_none():
    from app.services.filters_service import _filter_to_search_params

    params = _filter_to_search_params({"text": None, "area": None, "salary_min": None})
    assert "text" not in params
    assert "area" not in params
    assert "salary" not in params
    assert "only_with_salary" not in params


def test_filter_to_search_params_salary_zero_included():
    from app.services.filters_service import _filter_to_search_params

    params = _filter_to_search_params({"salary_min": 0})
    assert params["salary"] == 0
    assert params["only_with_salary"] == "true"
