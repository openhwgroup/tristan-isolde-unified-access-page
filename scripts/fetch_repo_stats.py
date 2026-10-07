#!/usr/bin/env python3

# -----------------------------------------------------------------------------
#  Copyright (C) 2026 Eclipse Foundation
#
#  This program and the accompanying materials are made
#  available under the terms of the Eclipse Public License 2.0
#  which is available at https://www.eclipse.org/legal/epl-2.0/
#
#  SPDX-License-Identifier: EPL-2.0
# -----------------------------------------------------------------------------
#
# fetch_repo_stats.py

"""
Pre-compute public repository statistics for every GitHub and GitLab URL found
in the `ips/*.json` catalogue files, and write them to `cfg/repo-stats.json`.

The platform page (unified-access.html) only fetches that JSON cache, so site
visitors never contact the GitHub or GitLab APIs and no authentication is
required for public repositories.

Intended to be run weekly from .github/workflows/repo-stats.yml, or manually:

  python3 scripts/fetch_repo_stats.py                 # refresh everything
  python3 scripts/fetch_repo_stats.py --dry-run       # just list parsed repos
  python3 scripts/fetch_repo_stats.py --only-missing  # keep recent cache entries

Only the Python standard library is used.

Unauthenticated calls to the GitHub REST API are limited to 60 requests/hour
per IP; set the GITHUB_TOKEN environment variable (e.g. the Actions-provided
secrets.GITHUB_TOKEN) to raise the limit to 5000/hour. GitLab rate limits are
generous for public projects; set GITLAB_TOKEN (or --gitlab-token) to send a
PRIVATE-TOKEN header to GitLab hosts only. Tokens are only ever sent from this
script to their respective hosts, never to site visitors.

Cache keys are lowercase "<host>/<owner>/<repo>" so the same project on two
hosts cannot collide ("github.com/pulp-platform/cva6",
"gitlab.com/selene-riscv-platform/euros2pronoc").

The URL normalisation rules below must be kept in sync with parseRepoRefs()
in tristan-isolde-unified-access-page/script.js:
  - GitHub: accepts https://github.com/{owner}/{repo} forms, optionally followed
    by /tree/<ref>, /blob/<ref>/..., /releases/... etc (only owner/repo is kept)
  - GitLab: any host containing "gitlab" (gitlab.com, gitlab.inria.fr, ...); the
    first two path segments are taken as group/project, everything from "/-/"
    onward and any "#anchor" are stripped. Known limitation: nested subgroups
    ("group/sub/project") are not resolved and yield a wrong two-segment path.
  - several URLs may be separated by ';' in one string
  - trailing prose is tolerated: the slug stops at the first invalid character
    (e.g. "https://github.com/pulp-platform/ara (branch: mp/xif ...)")
  - other hosts (bitbucket.org, vendor pages, ...) and empty values are ignored
"""

import argparse
import json
import os
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

API_ROOT = "https://api.github.com"
ACCEPT_HEADER = "application/vnd.github+json"
API_VERSION = "2022-11-28"
USER_AGENT = "uap-stats-bot"

# GitHub owner/repo slugs: alphanumerics, '-', '_', '.'.
# The regex extracts owner/repo from any github.com/... URL found in the data.
# Posts-processing can filter out false positives if needed.
_SLUG_RE = re.compile(
    r"github\.com/([A-Za-z0-9._-]+)/([A-Za-z0-9._-]+)"
)

# GitLab project URLs: any scheme://host containing "gitlab", followed by at
# least two path segments (group/project). Requiring the scheme prevents false
# positives on paths such as github.com/gitlab-tools/foo.
_GITLAB_SLUG_RE = re.compile(
    r"https?://([A-Za-z0-9.\-]*gitlab[A-Za-z0-9.\-]*)/([A-Za-z0-9._-]+)/([A-Za-z0-9._-]+)",
    re.IGNORECASE,
)


def utc_now_iso():
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _clean_part(part):
    return part.strip(".")


def _header(headers, name):
    """Case-insensitive header lookup (urllib preserves the API's casing)."""
    for key, value in headers.items():
        if key.lower() == name.lower():
            return value
    return None


class GithubProvider:
    """Parses github.com URLs and fetches stats from api.github.com."""

    name = "github"

    def parse_repos(self, url_value):
        """Extract lowercase "github.com/owner/repo" keys from a URL field."""
        if not url_value or not isinstance(url_value, str):
            return []

        keys = []
        # Split on ';' first so "url1; url2" becomes two independent chunks.
        for chunk in url_value.split(";"):
            for match in _SLUG_RE.finditer(chunk):
                owner = _clean_part(match.group(1))
                repo = _clean_part(match.group(2))
                # The regex is greedy over slug characters, so a value such as
                # ".../ara (branch: mp/xif" already stops at the space. However a
                # path like ".../cva6/tree/main" would capture "cva6" only because
                # '/' terminates the group; nothing else to strip here.
                if not owner or not repo:
                    continue
                key = f"github.com/{owner}/{repo}".lower()
                if key not in keys:
                    keys.append(key)
        return keys

    def fetch_stats(self, client, key, existing=None):
        """Fetch stats for one repo. Returns ((canonical_key, record), error)."""
        _, owner, repo = key.split("/", 2)
        base_url = f"{API_ROOT}/repos/{owner}/{repo}"
        # Revalidate a stale cache entry with its stored ETag when possible:
        # GitHub answers 304 without consuming a rate-limit request.
        if existing and existing.get("etag"):
            client.etags[base_url] = existing["etag"]

        status, headers, body = client.get(base_url)
        if status == 304 and existing:
            # Not modified: keep the cached record, only refresh its timestamp.
            refreshed = dict(existing)
            refreshed["fetched_at"] = utc_now_iso()
            return (existing.get("repo") or key, refreshed), None
        if status != 200:
            return None, f"HTTP {status}"
        info = json.loads(body.decode("utf-8"))

        default_branch = info.get("default_branch") or ""
        commits = _count_items(
            client,
            f"{base_url}/commits?per_page=1",
        )
        time.sleep(client.sleep_seconds)
        contributors = _count_items(
            client,
            f"{base_url}/contributors?per_page=1&anon=true",
        )
        time.sleep(client.sleep_seconds)

        license_info = info.get("license") or {}
        record = {
            "repo": key,
            "provider": self.name,
            "host": "github.com",
            "html_url": info.get("html_url") or base_url,
            "stars": info.get("stargazers_count"),
            "forks": info.get("forks_count"),
            "watchers": info.get("subscribers_count"),
            "open_issues": info.get("open_issues_count"),
            "commits": commits,
            "contributors": contributors,
            "language": info.get("language"),
            "license_spdx_id": license_info.get("spdx_id"),
            "default_branch": default_branch,
            "pushed_at": info.get("pushed_at"),
            "archived": bool(info.get("archived")),
            "fetched_at": utc_now_iso(),
            "etag": headers.get("ETag"),
        }
        # Normalise repo casing to the canonical form from the API.
        canonical = key
        html_url = record["html_url"] or ""
        m = re.search(r"github\.com/([^/]+)/([^/]+)", html_url)
        if m:
            canonical = f"github.com/{m.group(1)}/{m.group(2)}"
        return (canonical, record), None


class GitlabProvider:
    """Parses URLs on any GitLab host and fetches stats from its REST API v4.

    Host detection: the hostname equals gitlab.com or contains "gitlab"
    (covers self-hosted instances such as gitlab.inria.fr). Other unknown
    hosts stay ignored by parse_repos().

    Known limitation: nested subgroups ("group/sub/project") are not resolved;
    only the first two path segments are used as the project path.
    """

    name = "gitlab"

    def parse_repos(self, url_value):
        """Extract lowercase "<host>/group/project" keys from a URL field."""
        if not url_value or not isinstance(url_value, str):
            return []

        keys = []
        for chunk in url_value.split(";"):
            for match in _GITLAB_SLUG_RE.finditer(chunk):
                host = match.group(1).lower()
                if host != "gitlab.com" and "gitlab" not in host:
                    continue
                group = _clean_part(match.group(2))
                project = _clean_part(match.group(3))
                # Strip everything from "/-/" onward (e.g. "/-/tree/<ref>") and
                # "#anchor" are already handled by the regex character classes,
                # which stop at '/' and '#'. A trailing slash yields an empty
                # project segment and is skipped above.
                if not group or not project:
                    continue
                key = f"{host}/{group}/{project}".lower()
                if key not in keys:
                    keys.append(key)
        return keys

    def fetch_stats(self, client, key, existing=None):
        """Fetch stats for one project. Returns ((canonical_key, record), error)."""
        host, group, project = key.split("/", 2)
        encoded_path = urllib.parse.quote(f"{group}/{project}", safe="")
        base_url = f"https://{host}/api/v4/projects/{encoded_path}"
        if existing and existing.get("etag"):
            client.etags[base_url] = existing["etag"]

        status, headers, body = client.get(base_url)
        if status == 304 and existing:
            refreshed = dict(existing)
            refreshed["fetched_at"] = utc_now_iso()
            return (existing.get("repo") or key, refreshed), None
        if status != 200:
            return None, f"HTTP {status}"
        info = json.loads(body.decode("utf-8"))

        open_issues = self._fetch_open_issue_count(client, base_url, info)
        time.sleep(client.sleep_seconds)
        commits = self._fetch_commit_count(client, base_url)
        time.sleep(client.sleep_seconds)
        contributors = self._fetch_contributor_count(client, base_url)
        time.sleep(client.sleep_seconds)

        license_info = info.get("license") or {}
        record = {
            "repo": key,
            "provider": self.name,
            "host": host,
            "html_url": info.get("web_url") or f"https://{host}/{group}/{project}",
            "stars": info.get("star_count"),
            "forks": info.get("forks_count"),
            # GitLab's public API does not expose a watchers/subscribers count.
            "watchers": None,
            "open_issues": open_issues,
            "commits": commits,
            "contributors": contributors,
            # The project API payload does not include a primary language.
            "language": None,
            "license_spdx_id": license_info.get("spdx_id") or license_info.get("key"),
            "default_branch": info.get("default_branch") or "",
            "pushed_at": info.get("last_activity_at"),
            "archived": bool(info.get("archived")),
            "fetched_at": utc_now_iso(),
            "etag": headers.get("ETag"),
        }
        canonical = key
        web_url = record["html_url"] or ""
        m = re.match(r"https?://([^/]+)/([^/]+)/([^/?#]+)", web_url)
        if m:
            canonical = f"{m.group(1).lower()}/{m.group(2)}/{m.group(3)}"
        return (canonical, record), None

    def _fetch_open_issue_count(self, client, base_url, info):
        """Open issues + open merge requests (GitHub counts PRs in its total).

        gitlab.com omits open_issues_count from anonymous project payloads, so
        the count comes from the X-Total header of the paginated collections.
        """
        if info.get("open_issues_count") is not None:
            return info["open_issues_count"]
        total = 0
        got_any = False
        for collection in ("issues", "merge_requests"):
            try:
                status, headers, _body = client.get(
                    f"{base_url}/{collection}?state=opened&per_page=1"
                )
            except RuntimeError as exc:
                print(f"  warning: {exc}", file=sys.stderr)
                continue
            if status != 200:
                continue
            count = _header(headers, "X-Total")
            if count is not None and count.isdigit():
                total += int(count)
                got_any = True
        return total if got_any else None

    def _fetch_commit_count(self, client, base_url):
        """Count commits by paging (best effort).

        gitlab.com uses keyset pagination for repository/commits and does not
        send X-Total there, so count entries across pages up to a cap of 1000;
        return None when the history is longer than the cap.
        """
        total = 0
        page = None
        for _ in range(10):  # 10 pages x 100 commits = cap at 1000
            url = f"{base_url}/repository/commits?per_page=100"
            if page:
                url += f"&page={page}"
            try:
                status, headers, body = client.get(url)
            except RuntimeError as exc:
                print(f"  warning: {exc}", file=sys.stderr)
                return None
            if status != 200:
                return None
            # Self-hosted instances may still expose the total directly.
            count = _header(headers, "X-Total")
            if count is not None and count.isdigit():
                return int(count)
            try:
                parsed = json.loads(body.decode("utf-8"))
            except (json.JSONDecodeError, UnicodeDecodeError):
                return None
            if not isinstance(parsed, list):
                return None
            total += len(parsed)
            next_page = _header(headers, "X-Next-Page")
            if not next_page:
                return total
            page = next_page
        # History longer than the cap: report unknown rather than a wrong count.
        return None

    def _fetch_contributor_count(self, client, base_url):
        """Count contributors by paging through X-Next-Page (best effort)."""
        total = 0
        page = None
        for _ in range(5):  # cap at 5 pages
            url = f"{base_url}/repository/contributors?per_page=20"
            if page:
                url += f"&page={page}"
            try:
                status, headers, body = client.get(url)
            except RuntimeError as exc:
                print(f"  warning: {exc}", file=sys.stderr)
                return None if total == 0 else min(total, 100)
            if status != 200:
                return None if total == 0 else min(total, 100)
            try:
                parsed = json.loads(body.decode("utf-8"))
            except (json.JSONDecodeError, UnicodeDecodeError):
                return None if total == 0 else min(total, 100)
            if not isinstance(parsed, list):
                break
            total += len(parsed)
            if total >= 100:
                return 100
            next_page = _header(headers, "X-Next-Page")
            if not next_page:
                return total
            page = next_page
        return min(total, 100)


def provider_for_key(key):
    """Pick the provider for a cache key from its host segment."""
    host = key.split("/", 1)[0].lower()
    if host == "github.com" or host.endswith(".github.com"):
        return "github"
    return "gitlab"


def collect_repo_refs(ips_dir, providers):
    """Walk ips/*.json and return the ordered, de-duplicated list of keys."""
    keys = []
    seen = set()
    for path in sorted(Path(ips_dir).glob("*.json")):
        try:
            with open(path, "r", encoding="utf-8") as fh:
                data = json.load(fh)
        except (OSError, json.JSONDecodeError) as exc:
            print(f"warning: skipping {path.name}: {exc}", file=sys.stderr)
            continue
        if not isinstance(data, list):
            continue
        for entry in data:
            if not isinstance(entry, dict):
                continue
            # URL may be a string or (defensively) a list of strings.
            raw_values = entry.get("URL", "")
            if isinstance(raw_values, list):
                values = raw_values
            else:
                values = [raw_values]
            for value in values:
                for provider in providers:
                    for key in provider.parse_repos(value):
                        # Keys are lowercase; dedupe case-insensitively.
                        if key.lower() not in seen:
                            seen.add(key.lower())
                            keys.append(key)
    return keys


def _link_last_page(link_header):
    """Return the last page number from an HTTP Link header, or None."""
    if not link_header:
        return None
    for part in link_header.split(","):
        m = re.search(r'page=(\d+)>;\s*rel="last"', part)
        if m:
            return int(m.group(1))
    return None


class StatsClient:
    """Tiny REST client with rate-limit hygiene and ETag support.

    Sends the GitHub token only to github.com hosts and the GitLab token only
    to hosts whose name contains "gitlab".
    """

    def __init__(self, token=None, gitlab_token=None, sleep_seconds=0.3,
                 max_retries=4):
        self.token = token
        self.gitlab_token = gitlab_token
        self.sleep_seconds = sleep_seconds
        self.max_retries = max_retries
        self.etags = {}  # url -> etag (best effort within one run)

    def get(self, url):
        """GET an API URL. Returns (status, headers, body_bytes).

        Raises RuntimeError when the request keeps failing after retries.
        """
        host = (urllib.parse.urlsplit(url).hostname or "").lower()
        is_github = host == "github.com" or host.endswith(".github.com")
        attempt = 0
        while True:
            attempt += 1
            request = urllib.request.Request(url)
            request.add_header("User-Agent", USER_AGENT)
            if is_github:
                request.add_header("Accept", ACCEPT_HEADER)
                request.add_header("X-GitHub-Api-Version", API_VERSION)
                if self.token:
                    request.add_header("Authorization", f"Bearer {self.token}")
            elif "gitlab" in host and self.gitlab_token:
                request.add_header("PRIVATE-TOKEN", self.gitlab_token)
            etag = self.etags.get(url)
            if etag:
                request.add_header("If-None-Match", etag)
            try:
                with urllib.request.urlopen(request) as response:
                    headers = dict(response.headers)
                    body = response.read()
                    new_etag = headers.get("ETag")
                    if new_etag:
                        self.etags[url] = new_etag
                    return response.status, headers, body
            except urllib.error.HTTPError as exc:
                headers = dict(exc.headers or {})
                # 304 Not Modified arrives here on some versions.
                if exc.code == 304:
                    return 304, headers, b""
                rate_limited = exc.code in (403, 429)
                if rate_limited and attempt <= self.max_retries:
                    retry_after = _header(headers, "Retry-After")
                    remaining = _header(headers, "x-ratelimit-remaining")
                    if retry_after:
                        wait = int(retry_after) + 1
                    elif remaining == "0":
                        reset = _header(headers, "x-ratelimit-reset")
                        if reset:
                            wait = max(
                                int(reset) - time.time(), 0
                            ) + 5
                        else:
                            wait = 60
                    else:
                        wait = 2 ** attempt
                    print(
                        f"  rate limited on {url} (HTTP {exc.code});"
                        f" waiting {wait}s",
                        file=sys.stderr,
                    )
                    time.sleep(wait)
                    continue
                return exc.code, headers, b""
            except (urllib.error.URLError, TimeoutError) as exc:
                if attempt <= self.max_retries:
                    wait = 2 ** attempt
                    print(
                        f"  network error for {url}: {exc}; retrying in {wait}s",
                        file=sys.stderr,
                    )
                    time.sleep(wait)
                    continue
                raise RuntimeError(f"network failure for {url}: {exc}")


def _count_items(client, url):
    """Count items via the Link header's last page, else count returned items."""
    try:
        status, headers, body = client.get(url)
    except RuntimeError as exc:
        print(f"  warning: {exc}", file=sys.stderr)
        return None
    if status != 200:
        return None
    last_page = _link_last_page(headers.get("Link"))
    if last_page is not None:
        # per_page=1, so last page number == total item count.
        return last_page
    try:
        parsed = json.loads(body.decode("utf-8"))
    except (json.JSONDecodeError, UnicodeDecodeError):
        return None
    return len(parsed) if isinstance(parsed, list) else None


def load_existing_cache(path):
    if not path.exists():
        return {}
    try:
        with open(path, "r", encoding="utf-8") as fh:
            data = json.load(fh)
    except (OSError, json.JSONDecodeError):
        return {}
    repos = data.get("repos") if isinstance(data, dict) else None
    return repos if isinstance(repos, dict) else {}


def is_fresh(record, max_age_hours):
    if not isinstance(record, dict) or not record.get("fetched_at"):
        return False
    try:
        fetched = datetime.strptime(
            record["fetched_at"], "%Y-%m-%dT%H:%M:%SZ"
        ).replace(tzinfo=timezone.utc)
    except ValueError:
        return False
    age = (datetime.now(timezone.utc) - fetched).total_seconds()
    return age <= max_age_hours * 3600


def main():
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    parser.add_argument(
        "--ips-dir",
        default=str(ROOT / "ips"),
        help="Directory containing the ips/*.json catalogue files.",
    )
    parser.add_argument(
        "--out",
        default=str(ROOT / "cfg" / "repo-stats.json"),
        help="Path of the JSON cache to write.",
    )
    parser.add_argument(
        "--max-age-hours",
        type=float,
        default=168.0,
        help="Reuse existing cache entries fetched less than N hours ago"
        " (default 168 = 7 days).",
    )
    parser.add_argument(
        "--only-missing",
        action="store_true",
        help="Only fetch repos absent from the existing cache or older than"
        " --max-age-hours.",
    )
    parser.add_argument(
        "--limit-repos",
        type=int,
        default=0,
        help="Fetch at most N repos (0 = no limit). Useful with --dry-run.",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Parse and print the repo keys without any network access.",
    )
    parser.add_argument(
        "--auth-token",
        default=None,
        help="Optional GitHub token (overrides GITHUB_TOKEN env var). Useful for local testing.",
    )
    parser.add_argument(
        "--gitlab-token",
        default=None,
        help="Optional GitLab personal access token (overrides GITLAB_TOKEN"
        " env var). Sent as PRIVATE-TOKEN to GitLab hosts only.",
    )
    args = parser.parse_args()

    ips_dir = Path(args.ips_dir)
    if not ips_dir.is_dir():
        print(f"error: ips directory not found: {ips_dir}", file=sys.stderr)
        return 2
    out_path = Path(args.out)

    providers = {provider.name: provider for provider in
                 (GithubProvider(), GitlabProvider())}

    keys = collect_repo_refs(ips_dir, [providers["github"], providers["gitlab"]])
    print(f"Found {len(keys)} unique repositories in {ips_dir}/*.json")
    for key in keys:
        print(f"  {key}")

    if args.dry_run:
        return 0

    if args.limit_repos and args.limit_repos > 0:
        keys = keys[: args.limit_repos]

    token = args.auth_token or os.environ.get("GITHUB_TOKEN") or None
    gitlab_token = args.gitlab_token or os.environ.get("GITLAB_TOKEN") or None
    client = StatsClient(token=token, gitlab_token=gitlab_token)
    existing_cache = load_existing_cache(out_path)

    repos_out = {}
    errors = {}
    reused = 0
    for key in keys:
        # Match cache entries case-insensitively.
        existing = None
        existing_key = None
        for cache_key, value in existing_cache.items():
            if cache_key.lower() == key.lower():
                existing = value
                existing_key = cache_key
                break
        # Reuse recent cache entries so re-runs stay cheap within the rate limit.
        if existing and is_fresh(existing, args.max_age_hours):
            repos_out[existing_key] = existing
            reused += 1
            print(f"reusing cached {existing_key}")
            continue

        provider = providers[provider_for_key(key)]
        print(f"fetching {key} ({provider.name}) …")
        try:
            result, error = provider.fetch_stats(client, key, existing=existing)
        except RuntimeError as exc:
            errors[key] = str(exc)
            print(f"  error: {exc}", file=sys.stderr)
            continue
        if error:
            errors[key] = error
            print(f"  error: {error}", file=sys.stderr)
            continue
        canonical, record = result
        record["repo"] = canonical
        # Keys are lowercase "<host>/owner/repo"; UI lookups are case-insensitive.
        repos_out[canonical.lower()] = record
        time.sleep(client.sleep_seconds)

    payload = {
        "generated_at": utc_now_iso(),
        "source": "GitHub REST API + GitLab REST API (pre-computed)",
        "repos": {key: repos_out[key] for key in sorted(repos_out)},
        "errors": {key: errors[key] for key in sorted(errors)},
    }

    out_path.parent.mkdir(parents=True, exist_ok=True)
    with open(out_path, "w", encoding="utf-8") as fh:
        json.dump(payload, fh, indent=2, sort_keys=False, ensure_ascii=False)
        fh.write("\n")

    print(
        f"Wrote {out_path}: {len(payload['repos'])} repos"
        f" ({reused} reused), {len(payload['errors'])} errors"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
