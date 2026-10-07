# Deploying the Unified RISC-V Access Platform (UAP)

The UAP is a **pure static website**. There is no build step and no backend. The
JavaScript application (`script.js`, `editor.js`) is **host-agnostic**: it derives its
data sources from `window.location.href` and uses relative asset paths throughout the
HTML/CSS, so it can be served from any of the three options below with **no code
changes**.

This guide covers:

1. [GitHub Pages](#github-pages) (current / primary host)
<!-- 2. [GitLab Pages on the Eclipse Foundation GitLab](#gitlab-pages-eclipse-foundation) (`gitlab.eclipse.org`) -->
3. [Self-hosted static servers](#self-hosted)
4. [CI/CD Variables](# cicd-variables) required by the scheduled repository-stats job

---

## GitHub Pages

GitHub Pages is the primary, already-working host for the platform. No additional
configuration of the application code is needed.

**Enable / configure:**

1. Open the repository on GitHub (`openhwgroup/uap`).
2. Go to **Settings => Pages**.
3. Under **Build and deployment => Source**, select **Deploy from a branch**.
4. Set the branch to the default branch (e.g. `main`) and the folder to **`/ (root)`**.
5. Save. GitHub serves the repository root directly.

**Live URL:** <https://openhwgroup.github.io/uap/unified-access.html>

Because there is no build step, GitHub Pages serves the files exactly as committed.
The IP catalogue data under `ips/` and configuration under `cfg/` are loaded by the
browser at runtime from the same origin.

---

<!-- ## GitLab Pages (Eclipse Foundation)

The repository is mirrored to the Eclipse Foundation's self-hosted GitLab instance at
**`gitlab.eclipse.org`**. A `.gitlab-ci.yml` file at the project root deploys the site
to GitLab Pages automatically on every push to the default branch.

### How it works

- The `pages` job runs a standard GitLab Pages deployment: it copies the static files
  (`*.html`, `*.css`, `*.js`, plus the `images/`, `ips/`, and `cfg/` directories) into
  the `public/` artifact directory, which GitLab publishes.
- The configuration is **location-flexible**: it relies only on GitLab's predefined CI
  variables (`$CI_SERVER_HOST`, `$CI_PROJECT_PATH`, `$CI_DEFAULT_BRANCH`). It contains
  **no hardcoded** org/repo/branch literals, so the *identical* config works whether the
  project lives directly in a group (e.g. `gitlab.eclipse.org/groups/openhw-group/...`)
  or under a dated backup project (e.g. `gitlab.eclipse.org/openhw-group/backup-20260830/uap`).

### Deploy to a GitLab project

1. Push the repository to any project on `gitlab.eclipse.org`, for example inside the
   `openhw-group` group.
2. The pipeline runs automatically; the `pages` job publishes the site on the default
   branch.
3. GitLab serves Pages at a base path that includes the **full project path**. Because
   all asset and data references are relative or derived from `window.location.href`,
   sub-path hosting works with **no configuration**. You do not need to set a custom
   base URL.

### ⚠️ GitLab Pages availability may be restricted

> **Important:** GitLab Pages availability depends on the specific instance having the
> Pages feature enabled. The Eclipse Foundation's `gitlab.eclipse.org` instance **may
> restrict or disable Pages**. If that is the case, the `pages` job cannot serve the site.
>
> To avoid breaking the pipeline in this situation, the `pages` job uses
> `allow_failure: true`. This means:
> - If Pages is unavailable, the job is reported as a **warning (allowed failure)** and
>   the overall pipeline stays green.
> - The other jobs (`validate_ips`, `repo_stats`) keep running normally. They do **not**
>   depend on `pages`.
> - The job log prints a message pointing you to self-hosting as the fallback.
>
> **Fallback:** if Pages is disabled, use [self-hosting](#self-hosted) to serve the site.

--- -->

## Self-hosted

Because there is no backend, serving the UAP only requires any static file server that
can serve the repository root. You can launch a server using the following command:

```bash
scripts/serve.sh
# or simply:
python3 -m http.server 9000
```

Then open <http://localhost:9000/unified-access.html>.

### Production behind a reverse proxy

For production deployment (Nginx, Apache, etc.), simply point the web root at the
repository root. There is nothing to build or compile. Two things to confirm:

- Ensure `*.json` files are served with the correct MIME type (`application/json`). Most
  servers do this by default; if not, add an explicit mapping (e.g. Nginx's `mime.types`,
  Apache's `AddType application/json .json`). The catalogue and config files are fetched
  as JSON at runtime.
- Serve the directory **listings** for `ips/` if you want the platform to auto-discover
  the IP data files via a same-origin directory listing. If directory listings are
  disabled, the application falls back to the GitHub API derived from the current
  location where applicable; serving the directory listing is the simplest approach for a
  self-hosted deployment.
<!-- - Serve the directory **listings** for `ips/` if you want the platform to auto-discover
  the IP data files via a same-origin directory listing. If directory listings are
  disabled, the application falls back to the GitHub/GitLab API derived from the current
  location where applicable; serving the directory listing is the simplest approach for a
  self-hosted deployment. -->

---

## CI/CD Variables

The scheduled **repository statistics** job (`repo_stats` on GitLab CI /
`repo-stats.yml` on GitHub Actions) refreshes `cfg/repo-stats.json` and commits it back
to the repository. It reads public GitHub/GitLab APIs (tokens raise rate limits) and then
pushes the updated cache file, so a write-capable token is required for the commit-back.

| Variable | Platform | Required? | Purpose |
|----------|----------|-----------|---------|
| `GITHUB_TOKEN` | GitHub Actions | Built-in (`secrets.GITHUB_TOKEN`) | Raises the GitHub API rate limit used to collect stats; also allows the commit-back on GitHub. |
| `GITLAB_TOKEN` | Both | Optional | GitLab token that raises the GitLab API rate limit for repos hosted on GitLab instances. Sent as `PRIVATE-TOKEN` to GitLab hosts only. |
| `GITHUB_TOKEN` | GitLab CI | Required (masked) | Raises the GitHub API rate limit used by `fetch_repo_stats.py`. |
| `GITLAB_TOKEN` | GitLab CI | Optional (masked) | Same purpose as above for GitLab-hosted repositories. |
| `UAP_PUSH_TOKEN` | GitLab CI | Required (masked) | A **Project Access Token with `write_repository` scope**, used to commit `cfg/repo-stats.json` back via `https://oauth2:$UAP_PUSH_TOKEN@$CI_SERVER_HOST/$CI_PROJECT_PATH.git`. Because the URL is built from `$CI_SERVER_HOST`/`$CI_PROJECT_PATH`, it works regardless of where the project lives. |

**On GitHub Actions:** `GITHUB_TOKEN` is provided automatically. You can add an optional
`GITLAB_TOKEN` repository secret if your catalogue references GitLab-hosted repos and you
want higher rate limits.

<!-- **On GitLab CI (Settings => CI/CD => Variables):** add masked variables `GITHUB_TOKEN`,
optionally `GITLAB_TOKEN`, and `UAP_PUSH_TOKEN`. The `UAP_PUSH_TOKEN` must be a Project
Access Token with the `write_repository` scope so the scheduled job can commit the
refreshed cache back to the default branch. -->

<!-- ### GitLab protected-branch prerequisite

On GitLab the default branch is usually **protected**, so a plain write token alone is not
enough to push to it. The `UAP_PUSH_TOKEN` must be a **Project or Group Access Token**
with the `write_repository` scope **whose role is allowed to push to protected branches.**
Configure this under **Settings => Repository => Protected branches => “Allowed to push”**
(e.g. grant it to *Maintainers*, and make sure the token’s role is at least Maintainer).
If the token cannot push to the protected branch, the `repo_stats` commit-back step fails. -->

### ⚠️ Note on `allow_failure: true` in the `pages` job

Because the `pages` job uses `allow_failure: true`, a **genuine deployment failure also
appears as a warning rather than a failed (red) pipeline**, the same signal used when
Pages is simply unavailable. Do **not** trust a green pipeline as proof of a successful
deploy: always confirm the deployed site URL is actually reachable after the `pages` job
runs.

---

## Quick reference

| Hosting option | Mechanism | URL pattern |
|----------------|-----------|-------------|
| GitHub Pages | Settings => Pages, deploy from default branch `/ (root)` | `https://openhwgroup.github.io/uap/unified-access.html` |
<!-- | GitLab Pages (`gitlab.eclipse.org`) | `.gitlab-ci.yml` `pages` job on default branch | Pages base URL + full project path (depends on instance having Pages enabled) | -->
| Self-hosted | `scripts/serve.sh`, `python3 -m http.server`, or `npx serve .` | `http(s)://your-host/unified-access.html` |
