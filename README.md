<!--
#-------------------------------------------------------------------------------
# Copyright (C) 2025 Eclipse Foundation
# 
# This program and the accompanying materials are made
# available under the terms of the Eclipse Public License 2.0
# which is available at https://www.eclipse.org/legal/epl-2.0/
# 
# SPDX-License-Identifier: EPL-2.0
#-------------------------------------------------------------------------------
-->
<p align="center">
  <img src="images/logo_unified-riscv.png" alt="Unified RISC-V Logo" width="300">
</p>


<h1 align="center">European Unified RISC-V IP Access Platform</h1>

Welcome to the **European Unified RISC-V IP Access Platform** — a structured and expandable entry point designed to catalogue, document, and promote the IP assets initially developed in various European research projects such as <strong><a href="https://tristan-project.eu/">TRISTAN</a></strong>, <strong><a href="https://isolde-project.eu/">ISOLDE</a></strong>, and many others, with a specific focus on **RISC-V**.

This platform consolidates hardware and software components and offers a coherent view of their maturity, usability, licensing, and integration workflows.

While not all elements are fully implemented yet, the platform already contributes to several priority objectives, including:

- **Improving visibility and accessibility** by centralising information in a single access point;
- **Strengthening exploitation foundations** by clarifying how IPs relate to project-level strategies;
- **Facilitating interoperability and documentation** through initial workflow descriptions and structured repository information;
- **Aligning practices** with related initiatives beyond **TRISTAN**, such as **ISOLDE**, **Rigoletto**, and others, to move toward consistent governance and IP management;
- **Supporting internal and external adoption** with clearer structures and integration pathways.


Additional features — such as KPI-based adoption monitoring, extended interoperability matrices, reinforced internal tooling adoption, and long-term community-building activities — are planned as part of the platform’s **progressive roadmap**.

The platform acts as a **static unified access page**, pointing to repositories hosted on the **OpenHW Foundation GitHub**, automatically mirrored to a European-hosted **GitLab** instance and to other public forges as applicable, or maintained as private assets. It provides documentation, status information, and an evolving structure designed to better support integration across toolchains, accelerators, and infrastructure components.

The repository includes a dedicated `/ip_cards` directory intended to host optional IP Cards for those IPs that provide such documentation. This hosting option is provided for IP owners who prefer centralised publication within the UAP, rather than maintaining the material on their own premises.

Our ambition is to progressively transform this platform into a sustainable, interoperable, and community-oriented resource for the broader **RISC-V ecosystem** — while transparently reflecting the incremental progress being made.

---

<h2 align="center"> <a href="https://openhwgroup.github.io/uap/unified-access.html">🚀 Access the Platform</a></h2>

---

<h2 align="center">Deployment</h2>

The platform is a pure static website (no build step, no backend) and can be deployed to any of these hosts:

- **GitHub Pages** — the primary host, served from the repository root (`https://openhwgroup.github.io/uap/unified-access.html`).
<!-- - **GitLab Pages on the Eclipse Foundation GitLab** (`gitlab.eclipse.org`) — deployed automatically by the `.gitlab-ci.yml` `pages` job on the default branch; location-flexible so it works in any group or backup project. -->
- **Self-hosted** — serve the repository root with `scripts/serve.sh` (or `python3 -m http.server 8080`) or `npx serve .`.

See [DEPLOYMENT.md](./DEPLOYMENT.md) for full instructions, including required CI/CD variables.

---

<h2 align="center">Supported by</h2>
<p align="center">
	<a href="https://tristan-project.eu/"><img src="images/tristan-logo.png"></a>
	  &nbsp;&nbsp;&nbsp;
	<a href="https://isolde-project.eu/"><img src="images/isolde-logo.png"></a>
</p>

---

 
<p align="center">
  <img src="images/eu-funded.png" alt="EU Funding Logo" width="180">
  &nbsp;&nbsp;&nbsp;
  <img src="images/chips-ju.png" alt="Chips JU Logo" width="160">
  &nbsp;&nbsp;&nbsp;
  <img src="images/openhw-logo.png" alt="OpenHW Logo" width="150">
</p>

<p align="center">
This project has received funding from the Chips Joint Undertaking (Chips JU)
under the European Union’s Horizon Europe Research and Innovation Programme,
and from the European Union, under Grant Agreements No. 101095947 (TRISTAN),
101112274 (ISOLDE).
</p>

<p align="center">
© 2025 Eclipse Foundation — All rights reserved.
</p>