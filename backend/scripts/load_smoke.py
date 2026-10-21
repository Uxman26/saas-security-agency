import sys
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from fastapi.testclient import TestClient

from app.main import app


def main():
    client = TestClient(app)
    errors = 0
    for _ in range(40):
        res = client.get("/live-support/status")
        if res.status_code != 200:
            errors += 1

    def hit(_):
        return client.get("/patrol/check/not-a-real-token").status_code

    with ThreadPoolExecutor(max_workers=8) as pool:
        codes = list(pool.map(hit, range(24)))

    print(
        {
            "status_errors": errors,
            "patrol_codes": sorted(set(codes)),
            "patrol_n": len(codes),
        }
    )
    if errors:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
