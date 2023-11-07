# Tristan Unified Access Page

It provides references and descriptions of all the `TRISTAN` IPs (hardware and software).
It serves as a `Virtual Repository` page, gathering all the information about the TRISTAN repositories, their status,
and the TRISTAN partners involved in them.

Some of the repositories are hosted on the OpenHW Group GitHub forge, some are located on other public pages, and some are closed-source.

The diagram below shows how the TRISTAN repositories are organized.


<img src="https://github.com/openhwgroup/tristan-unified-access-page/blob/main/images/tristan_virtual_repo.png" align="center" />

The Tristan Unified Access Page is the deliverable of the Task 2 of the Work Package 7 (7.2).


## TRISTAN IPs

Repository | URL/Instructions | TRISTAN Working Items | Partners                    | Status                      | License   |
---------- | ---------------- | --------------------- | -------------------------- | --------------------------- | --------- |
cve2       | [cve2](https://github.com/openhwgroup/cve2) | WI2.2.5, WI2.2.8, WI2.5.7 | NXP, Synthara, Politecnico di Torino | Design and Verification in progress | Solderpad |
TimeWeaver | [absint.com/timeweaver](https://www.absint.com/timeweaver/) | WI4.1.5 | AbsInt | Waiting for WI4.1.3 / WI2.2.1 | proprietary |
CompCert   | [github.com/AbsInt/CompCert](https://github.com/AbsInt/CompCert) | WI4.2.4 | AbsInt | Waiting for WI2.5.4 | dual licensed (see repository) |
HPDcache   | [github.com/openhwgroup/cv-hpdcache](https://github.com/openhwgroup/cv-hpdcache) | WI3.1.5 | CEA | Design and verification in progress | Solderpad |
CVA6       | [cva6](https://github.com/openhwgroup/cva6) | WI2.4.1, WI2.4.2, WI2.4.3, WI2.4.5 | Thales, Sysgo, TU Darmstadt, Bosch  | Design and Verification in progress | Solderpad |
UVM env for RISC-V verif | [core-v-verif](https://github.com/openhwgroup/core-v-verif) | WI2.4.1 | Thales | CVA6 verification in progress | Solderpad |
Yocto for CVA6 | [meta-cva6-yocto](https://github.com/openhwgroup/meta-cva6-yocto) | WI4.3.3 | Thales | Initial release | MIT |
Setting up Yocto and baremetal debug on CVA6 | [cva6-eclipse-demo](https://github.com/ThalesGroup/cva6-eclipse-demo) | WI4.3.3 |Thales | Initial release | Apache |
CLIC       | [clic](https://github.com/pulp-platform/clic) | WI3.1.7 | ETH | Design and Verification in progress | Apache-2.0 |
RVV coprocessor for CVA6  | [RVV-coprocessor](https://github.com/pulp-platform/ara) | WI2.4.4 | ETH | Design and Verification in progress | Solderpad |
AXI LLC    | [AXI-LLC](https://github.com/pulp-platform/axi_llc) | WI3.1.5 | ETH | Design and Verification in progress | Solderpad |
AXI        | [AXI](https://github.com/pulp-platform/axi) | WI3.2.1 | ETH | Design and Verification in progress | Solderpad |
Hypervisor | [H-extension](https://github.com/openhwgroup/cva6) | WI2.5.10 | ETH, Sysgo | Design and Verification in progress | Solderpad |
Timing Channel Protection | [timing-channel-protection](https://github.com/pulp-platform/cva6) | WI2.1.1 | ETH | Design and Verification in progress | Solderpad |
IP-XACT extension for timing and power intent | Not published yet | WI5.3.3 | EPOS | Concept in development| To be determined|
Compression and decompression of digital waveforms| [Tristan](https://github.com/semify-eda/tristan/tree/f6516af367ea9729658724e39aa83fa65c2aa884) | WI2.5.11 | semify | Design and Verification in progress | To be determined|
eFPGA| [I:Embedded-fpga](https://github.com/yongatek/eFPGA) | WI3.4.5 | YNGA | Design in progress | Solderpad |
Accelerator for post-quantum cryptography| To do | WI3.3.4 | TUM, Politecnico di Torino | Design  in progress | To be determined|
CMSIS like Open-Source AI, as well as DSP- and compute (e.g. BLAS) libraries| [RiscV-NN](https://github.com/eml-eda/RiscV-NN) | WI4.4.1 | IFX, Politecnico di Torino, UNIBO, CEA | Design  in progress | To be determined|
End-to-end stack for ML software development on embedded RISC-V platforms| [Plinio](https://github.com/eml-eda/plinio) | WI4.4.4 | ANTM, Politecnico di Torino, UNIBO | Design  in progress | Apache 2.0|
