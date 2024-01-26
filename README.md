# Tristan Unified Access Page

It provides references and descriptions of all the [TRISTAN](https://tristan-project.eu/) IPs (hardware and software).
It serves as a `Virtual Repository` page, gathering all the information about the TRISTAN repositories, their status,
and the TRISTAN partners involved in them.

Some of the repositories are hosted on the OpenHW Group GitHub forge, some are located on other public pages, and some are closed-source.

The diagram below shows how the TRISTAN repositories are organized.


<img src="https://github.com/openhwgroup/tristan-unified-access-page/blob/main/images/tristan_virtual_repo.png" align="center" />

The Tristan Unified Access Page is the deliverable of the Task 2 of the Work Package 7 (7.2).


## TRISTAN IPs

### CORES

Repository | URL/Instructions | TRISTAN Working Items | Partners                    | Status                      | License   |
---------- | ---------------- | --------------------- | --------------------------- | --------------------------- | --------- |
cve2       | [cve2](https://github.com/openhwgroup/cve2) | WI2.2.5, WI2.2.8, WI2.5.7 | NXP, Synthara, Politecnico di Torino | Design and Verification in progress | Solderpad |
Extensions to the micro-architecture of CV32E40P core | [CV32E40P (fork)](https://github.com/pulp-platform/cv32e40p) | WI2.3.3 | UNIBO | Design and Verification in progress | Solderpad |
VSRV1: simple 32-bit Linux RISC-V | To Be Done | WI2.3.5 | VLSI Solution | Design and Verification in progress | To Be Decided |
CVA6       | [cva6](https://github.com/openhwgroup/cva6) | WI2.4.1, WI2.4.2, WI2.4.3, WI2.4.5 | Thales, Sysgo, TU Darmstadt, Bosch  | Design and Verification in progress | Solderpad |
RVV coprocessor for CVA6  | [RVV-coprocessor](https://github.com/pulp-platform/ara) | WI2.4.4 | ETH | Design and Verification in progress | Solderpad |
Timing Channel Protection | [timing-channel-protection](https://github.com/pulp-platform/cva6) | WI2.1.1 | ETH | Design and Verification in progress | Solderpad |
UVM env for RISC-V verif | [core-v-verif](https://github.com/openhwgroup/core-v-verif) | WI2.4.1 | Thales | CVA6 verification in progress | Solderpad |
Compression and decompression of digital waveforms| [Tristan](https://github.com/semify-eda/tristan/tree/f6516af367ea9729658724e39aa83fa65c2aa884) | WI2.5.11 | semify | Design and Verification in progress | To be determined|
TraceUnit | Not published yet | WI2.1.4, WI2.2.1, WI2.3.4, WI2.5.4| ACCT, FHG, MNRS, SYSGO| Design and Verification in progress | To be determined |
Hypervisor | [H-extension](https://github.com/openhwgroup/cva6) | WI2.5.10 | ETH, Sysgo | Design and Verification in progress | Solderpad |
Riviera: RISC-V ISA Extensions for NFC Applications | To Be Done | WI2.5.1 | NXP Austria, Politecnico di Torino, Technical University of Graz | Design and Verification in progress | To Be Decided |

### PERIPHERALS

Repository | URL/Instructions | TRISTAN Working Items | Partners                    | Status                      | License   |
---------- | ---------------- | --------------------- | --------------------------- | --------------------------- | --------- |
TSN-TraceBus | Not published yet | WI3.1.1| ACCT, BOSCH-DE, FHG, SYSGO| Design and Verification in progress | To be determined |
HPDcache   | [github.com/openhwgroup/cv-hpdcache](https://github.com/openhwgroup/cv-hpdcache) | WI3.1.5 | CEA | Design and verification in progress | Solderpad |
CLIC       | [clic](https://github.com/pulp-platform/clic) | WI3.1.7 | ETH | Design and Verification in progress | Apache-2.0 |
AXI LLC    | [AXI-LLC](https://github.com/pulp-platform/axi_llc) | WI3.1.5 | ETH | Design and Verification in progress | Solderpad |
AXI        | [AXI](https://github.com/pulp-platform/axi) | WI3.2.1 | ETH | Design and Verification in progress | Solderpad |
eFPGA| [I:Embedded-fpga](https://github.com/yongatek/eFPGA) | WI3.4.5 | YNGA | Design in progress | Solderpad |
Accelerator for post-quantum cryptography| To do | WI3.4.4 | TUM, Politecnico di Torino | Design  in progress | To be determined|
Low-power IO DMA | [IO DMA](https://github.com/pulp-platform/udma_core) | WI3.1.4 | UNIBO | Design and Verification in progress | Solderpad |
Heterogeneous Cluster Interconnect (HCI)) | [HCI](https://github.com/pulp-platform/hci) | WI3.2.2 | UNIBO | Design and Verification in progress | Solderpad |
Low-power FP32/FP16 Accelerator for MatMul | [RedMule](https://github.com/pulp-platform/redmule) | WI3.4.1 | UNIBO | Design and Verification in progress | Solderpad |

### SOFTWARE

Repository | URL/Instructions | TRISTAN Working Items | Partners                    | Status                      | License   |
---------- | ---------------- | --------------------- | --------------------------- | --------------------------- | --------- |
TimeWeaver | [absint.com/timeweaver](https://www.absint.com/timeweaver/) | WI4.1.5 | AbsInt | Waiting for WI4.1.3 / WI2.2.1 | proprietary |
CompCert   | [github.com/AbsInt/CompCert](https://github.com/AbsInt/CompCert) | WI4.2.4 | AbsInt | Waiting for WI2.5.4 | dual licensed (see repository) |
Yocto for CVA6 | [meta-cva6-yocto](https://github.com/openhwgroup/meta-cva6-yocto) | WI4.3.3 | Thales | Initial release | MIT |
Setting up Yocto and baremetal debug on CVA6 | [cva6-eclipse-demo](https://github.com/ThalesGroup/cva6-eclipse-demo) | WI4.3.3 |Thales | Initial release | Apache |
End-to-end stack for ML software development on embedded RISC-V platforms| [Plinio](https://github.com/eml-eda/plinio) | WI4.4.4 | ANTM, Politecnico di Torino, UNIBO | Design  in progress | Apache 2.0|
CMSIS like Open-Source AI, as well as DSP- and compute (e.g. BLAS) libraries| [RiscV-NN](https://github.com/eml-eda/RiscV-NN) | WI4.4.1 | IFX, Politecnico di Torino, UNIBO, CEA | Design  in progress |
COREV GCC | [COREV GCC (fork)](https://github.com/EEESlab/corev-gcc/tree/tristan-dev) | WI4.2.1 | UNIBO | Design and Verification in progress | GPL |
COREV Binutils | [COREV Binutils (fork)](https://github.com/EEESlab/corev-binutils-gdb/tree/tristan-dev) | WI4.2.1 | UNIBO | Design and Verification in progress | GPL |
ELinOS embedded Linux for RISC-V | [ELinOS](https://www.sysgo.com/elinos) | WI4.3.2 | SYSGO | To be released in spring 2024 | GPL |
PikeOS CVA-6 support | [PikeOS](https://www.pikeos.com/) | WI4.3.3 | SYSGO | To be released | proprietary |  
LLVM TD from ADL | TBD | WI4.2.1, WI4.2.3 | NXP | Design and verification in progress | TBD |  
Cloud Connector | Not published yet | WI 4.3.4 | aicas | To be determined |
RISC-V Runtime | Not published yet | WI4.4.1 | CEA | Design and verification in progress | Apache |
VxP Tools and Libraries | Not published yet | WI3.4.2, WI4.2.1, WI4.2.6, WI4.4.1 | CEA | Design and verification in progress | Apache |

### TOOLS


Tool | URL/Instructions | TRISTAN Working Items | Owner/Contributors  |  Users               | Description                     | License   |
-------- | -------------- | ------------ | ---------- | -------------- | --------------------------- | --------- |
Renode | [Renode](https://github.com/renode/renode) | 5.1.1 | Antmicro | Tampere University, NOKIA, Cargotec | Simulation Framework| |
ETISS | [ETISS](https://github.com/tum-ei-eda/etiss) | 5.1.2 | Technische Universität München | Infineon | Extendible Translating  Instruction Set Simulator| BSD 3-clause  |
SCC | [SCC](https://github.com/Minres/SystemC-Components) | 5.1.4 | Minres | BOSCH-DE, CEA | SystemC Components| |
PySysC | [PySysC](https://github.com/Minres/PySysC/) | 5.1.4 | Minres | BOSCH-DE, CEA | Python bindings for SystemC| |
Core DSL | [Core DSL](https://github.com/Minres/CoreDSL) | 5.1.4 | Minres | BOSCH-DE, CEA | Language to describe ISAs for ISS generation and HLS of RTL implementation​​| |
DBT-RISE &​ DBT-RISE-RISCV | [DBT-RISE](https://github.com/Minres/CoreDSL) [DBT-RISE-RISCV](https://github.com/Minres/DBT-RISE-RISCV) | 5.1.4, 5.3.2 | Minres | BOSCH-DE, CEA,ACC |Dynamic Binary Translation - Retargetable ISS Environment​​ Application of CoreDSL  & DBT-RISE for RISCV​​| |
Verilator | [Verilator](https://www.veripool.org/verilator/) | 5.2.1 | Antmicro | CEA |  RTL verification (simulation, formal)​ Co-simulation with Renode​​| |
Questa Verify Property App | [Questa](https://eda.sw.siemens.com/en-US/ic/questa/onespin-formal-verification/) | 5.2.2 | Siemens EDA | TRT | Formal verification solutions for RISC-V (OneSpin)​​| |
Yosys | [Yosys](https://github.com/YosysHQ/yosys) | 5.2.5 | TBD | CEA | Open Synthesis Suite​​​| |
Catapult | [Catapult](https://eda.sw.siemens.com/en-US/ic/catapult-high-level-synthesis/) | 5.2.7 | Siemens EDA | Siemens-AT | High Level Synthesis and verification suite​​​| |
Kactus2 | [Kactus2](https://github.com/kactus2/kactus2dev) | 5.2.7 | Minres, Tampere University | Tampere University, NOKIA, Cargotec | High Level Synthesis and verification suite​​​| |
Codasip Studio | [Codasip Studio](https://codasip.com/products/codasip-studio/) | 5.1.3 | Codasip | BOSCH – DE, BOSCH – FR, Minres | Tool suite to develop/customize RISC-V IPs​​​| |
GVSOC | [GVSOC (fork)](https://github.com/EEESlab/gvsoc/tree/tristan-dev) | WI5.1.5 | UNIBO | Politecnico di Torino | RISC-V Platform Simulator​ | Apache-2.0 |
Messy  | TBD| WI5.1.5 | Politecnico di Torino | UNIBO |  Multi-layer Extra-functional Simulator using SYstemC​ |  |
Spike  | [Spike](https://github.com/riscv-software-src/riscv-isa-sim) | WI5.1.7 | OpenHW Group | Thales, Synthara |  RISC-V ISA simulator​ |  |
VPTOOL  | [VPTOOL](https://github.com/riscv-software-src/riscv-isa-sim) | WI5.1.8 | OpenHW Group | Thales, Siemens-AT |  Graphical edition of a Design Verification Plan ​ |  |
SoCDSL  | TBD | WI5.1.8 | Technische Universität Darmstadt | Minres, Tampere University |  Automated composition and optimization of compute-intensive SoCs from abstract high-level descriptions​ ​ |  |
cv_dv_utils | [CV_DV_UTILS](https://github.com/openhwgroup/core-v-verif) | WI3.1.5 | OpenHW Group| CEA | UVM verification environment for OpenHW cores | Apache-2.0 |



# Acknowledgements

TRISTAN has received funding from the Chips Joint Undertaking (Chips JU) under grant agreement nr. 101095947. The Chips JU receives support from the European Union’s Horizon Europe’s research and innovation programmes and participating states are Austria, Belgium, Bulgaria, Croatia, Cyprus, Czechia, Germany, Denmark, Estonia, Greece, Spain, Finland, France, Hungary, Ireland, Israel, Iceland, Italy, Lithuania, Luxembourg, Latvia, Malta, Netherlands, Norway, Poland, Portugal, Romania, Sweden, Slovenia, Slovakia, Turkey.

![EU Logo](images/logo_EU.png)&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;![ChipsJU_Logo](images/logo_chipsJU.png)   



