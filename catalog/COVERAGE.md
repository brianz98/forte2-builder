# Catalog coverage of forte2

This page records what `forte2-2026.10.1.yaml` covers of forte2's public API, what it leaves out and
why, and where in forte2 each compatibility check comes from. A forte2 graph exporter
([#11](https://github.com/brianz98/forte2-builder/issues/11)) and declarative rules
([#13](https://github.com/brianz98/forte2-builder/issues/13)) should reproduce the catalog's nodes,
connections, and rules from forte2 itself.

The catalog describes forte2
[`v2026.10.1-alpha`](https://github.com/evangelistalab/forte2/releases/tag/v2026.10.1-alpha), and
its dump was generated from that tag's sources.

## Public API

### Nodes

| forte2 name | Catalog node | Notes |
| --- | --- | --- |
| `System`, `HubbardModel` | `System`, `HubbardModel` | |
| `RHF`, `ROHF`, `UHF`, `CUHF`, `GHF` | Same names | |
| `AVAS`, `ASET`, `SpinorUpcaster` | Same names | |
| `CI`, `MCOptimizer` | Same names | Drivers; each owns one solver. |
| `CISolver`, `SelectedCISolver`, `RelCISolver`, `RelSelectedCISolver` | Same names | Solvers go only in a driver's `ci_solver` slot. |
| `DSRG_MRPT2`, `RelDSRG_MRPT2` | Same names | |
| `FDGradient`, `GeometryOptimizer` | Same names | |
| `State`, `RelState`, `X2CParams` | Same names | Values that go in a slot. |
| `forte2.base_classes`: `CIParams`, `DavidsonLiuParams`, `SelectedCIParams` | Same names | Values that go in a slot. |
| `get_1e_property`, `mulliken_population`, `write_orbital_cubes` | Same names | Analysis nodes. |
| `forte2.orbitals`: `IAO`, `IBO` | Same names | Analysis nodes on RHF. |
| `forte2.props`: `iao_partial_charge`, `MutualCorrelationAnalysis` | Same names | Analysis nodes. |

### Covered by an option instead of a node

| forte2 name | Covered by |
| --- | --- |
| `MOSpace` | The solvers' `core_orbitals`, `active_orbitals`, `frozen_core_orbitals`, and `frozen_virtual_orbitals`. The builder hides `mo_space_override`. |
| `Semicanonicalizer`, `NaturalOrbitals`, `make_natural_orbitals`, `make_final_orbitals` | The drivers' `final_orbitals`. |
| `CubeGenerator` (and its alias `Cube`) | `write_orbital_cubes`. |
| `PGSymmetryDetector`, `MOSymmetryDetector` | `System.symmetry`. |
| `build_basis`, `decontract_basis` | The System's basis options, including the `decon-` prefix. |
| `mo_overlap`, `project_orbitals`, `project_occupied_orbitals`, and the `forte2.base_classes.rebuild` functions, such as `project_scf_guess` | `project_orbitals` on `FDGradient` and `GeometryOptimizer`. forte2 exports no function that seeds one chain's SCF from another. |

### Not in the builder yet

`forte2.orbitals.ci_overlap(ci_1, ci_2, root_1=0, root_2=0, algorithm="biorthogonal")` computes the
overlap of two CI wavefunctions, which can differ in geometry, basis set, orbitals, and active
space. It takes two drivers, a bra and a ket, but an analysis node has only one upstream node. Its
requirements, from `orbitals/wavefunction_overlap.py`:
- Both drivers own a `CISolver` or a `RelCISolver`.
- Both wavefunctions are one-component or both are two-component, with the same numbers of alpha
  and beta electrons, or the same number of electrons if two-component.
- `algorithm="biorthogonal"` needs the same core and active spaces in both, and the complete CAS
  determinant space. `algorithm="naive"` handles any pair.

### Left out

| forte2 name | Reason |
| --- | --- |
| `ModelSystem` | Its `hcore`, `eri`, and `overlap` fields are `init=False`, so a model Hamiltonian is a Python subclass, not a set of options. |
| `forte2.dsrg.RelDSRG_MRPT2_Slow` | A reference implementation that forte2's tests compare `RelDSRG_MRPT2` against. |
| `forte2.utils.mutual_correlation_plot` | Needs matplotlib, PIL, and rendered orbital images. |
| `forte2.utils.spectrum.convolution` | Returns arrays for plotting, which a script builder has no way to show. |
| `set_verbosity_level`, `logger` | Script-wide settings, not part of a chain. |
| `load_mods`, `enable_mod` | See [#10](https://github.com/brianz98/forte2-builder/issues/10). |
| `forte2.orbitals.extents.orbital_extents` | A debugging helper. |
| `EmbeddingMOSpace`, `StateAverageInfo`, `X2CHelper`, `FockBuilder`, the `jkbuilder` integral classes, the `mcopt` response and gradient functions, `finite_difference`, and the `helpers` solvers | Internal to the methods that use them. |
| `forte2.lib` (`sparse_ops`, `det`, `ci_helpers`, `ints`) and `integrals` | Toolkits for writing methods, not steps in a calculation. |

### Hidden options

The catalog hides these constructor arguments, because none of them has a form control:
- `energy_accessor` on `FDGradient` and `method_factory` on `GeometryOptimizer`, which take callables.
- `lbfgs_kwargs` on `GeometryOptimizer`, which takes a dictionary.
- `rng` on `SpinorUpcaster`, which takes a random number generator.
- `guess_dets` and `pinned_guess_dets` on `SelectedCIParams`, which take determinants.
- `mo_space_override` and `log_level` on the solvers.
- `j_adapt` on `IAO`, because `IAO.make_sf_1rdm` raises `NotImplementedError` for j-adapted IAOs.

## Where each check comes from

Paths are relative to the forte2 package.

| Check | forte2 source | Catalog encoding |
| --- | --- | --- |
| An SCF follows a System or model Hamiltonian | `scf/scf_base.py`: `SCFBase.__call__` | `parents` on `_scf` |
| Spin-orbit X2C needs GHF | `SCFBase.__call__` | Rule on `_one_component_scf` |
| RHF needs an even electron count | `scf/rhf.py`: `RHF._parse_state` | `electrons.closed_shell` |
| UHF, ROHF, and CUHF need `ms`, with the right parity | `scf/uhf.py`: `UHF._parse_state`, reused by ROHF and CUHF | `electrons.ms`, and `ms` is required |
| GHF's `ms_guess` has the right parity | `scf/ghf.py`: `GHF._parse_state` | `electrons.ms` |
| A model Hamiltonian needs the core guess | `scf/scf_utils.py`: `minao_initial_guess` needs a basis | Rule on `_scf` |
| A System needs density fitting or Cholesky | `jkbuilder/jkbuilder.py` has no four-index path | Rule on `System` |
| `jk_mem_thres_mb` needs density fitting | `system/system.py`: `System._init_fock_builder` | Rules on `System` |
| `cholesky_tei` ignores the auxiliary basis | `System._init_basis` warns | Warning on `System` |
| SNSO scaling needs `so` and `1e` | `base_classes/params.py`: `X2CParams.__post_init__` | Rule on `X2CParams` |
| Davidson–Liu subspace sizes | `DavidsonLiuParams.__post_init__` | Rules on `DavidsonLiuParams` |
| AVAS follows RHF, ROHF, or GHF | `orbitals/avas.py`: `AVAS.__call__` (`isinstance`) | `parents` |
| AVAS selection options | `AVAS._check_parameters` | Rules on `AVAS` |
| AVAS, IAO, and IBO need a minimal basis | `System.minao_basis`, used by `AVAS.__call__` and `IAO._make_iao` | Rules |
| ASET follows MCOptimizer | `orbitals/aset.py`: `ASET.__call__` (`isinstance`) | `parents` |
| A solver matches the orbitals' component count | `base_classes/active_space_solver.py`: `requires_attrs` | `requires_attrs` |
| A driver meets its solver's requirements | `base_classes/active_space_driver.py`: `requires_attrs \|= ci_solver.requires_attrs` | `delegates_to` |
| A solver needs an active space from upstream or its own options | `ActiveSpaceSolver._make_mo_space` | Rule on `_solver` |
| A two-component solver takes `nel` or states, not both | `RelActiveSpaceSolver.__post_init__` | Rule |
| CI algorithms per solver | `_allowed_algorithms` in `ci/ci.py` and `ci/rel_ci.py` | Rules on the CI solvers |
| DSRG follows a driver | `dsrg/dsrg_base.py`: `DSRGBase.__call__` (`isinstance`) | `parents` |
| DSRG needs 3-RDMs | `DSRG_MRPT2.get_integrals` calls `make_average_cumulant(3)`; the selected-CI solvers declare `_rdm_orders = (1, 2)` | `rdm3`, set by each solver and required by `_dsrg` |
| Two-component solvers give no transition densities | `_rdm_cross_state_orders = ()` in `ci/rel_ci.py` and `sci/rel_sci.py`; `CIBase.compute_transition_properties` | Warning on `_driver` |
| Transition dipoles need dipole integrals | `CIBase.compute_transition_properties` calls `get_1e_property` | Rule on `_driver` |
| Moving atoms needs `symmetry=False` | `System.with_geometry`, called by `FDGradient` and `GeometryOptimizer` | Rules on both |
| `FDGradient.root` indexes `E` | `gradients/fd_gradient.py`: `FDGradient._get_energy` | Rule on `FDGradient` |
| `GeometryOptimizer.root` needs a state-averaged MCOptimizer | `optimize/geometry_optimizer.py`: `_method_energy` reads `E_ci`; `MCOptimizer.gradient(root)` | Rules on `GeometryOptimizer` |
| Analytic gradients need density fitting | `gradients/validation.py`: `validate_df_gradient_system` | Rules on `GeometryOptimizer` |
| CASSCF gradient limits | `mcopt/mc_optimizer_grad.py`: `_validate_casscf_gradient_request` | Rules on `GeometryOptimizer` |
| A State fits its electron count | `state/state.py`: `State.__post_init__` | Built into the builder |
| Mulliken populations need a one-component density | `props/props.py`: `mulliken_population` | `requires_attrs` |
| Mutual correlation needs a one-component solver | `props/mutual_correlation.py` reads spin-dependent RDMs | `requires_attrs` |

## Checks the builder doesn't make yet

- Orbital indices and counts against the basis and the electron count
  ([#6](https://github.com/brianz98/forte2-builder/issues/6)), including `active_frozen_orbitals`
  being sorted and inside the active space.
- GAS restrictions (`gas_min`, `gas_max`) against the number of GAS spaces.
- Whether an MCOptimizer is state-averaged. forte2 needs `root` for its gradient, and the builder
  checks only the reverse.
- One `SelectedCIParams` and one `DavidsonLiuParams` per State, which the selected-CI solvers accept
  as lists.
- The AVAS `cutoff` against `evals_threshold`.
- A tuple `level_shift`, which only UHF accepts.
- Gaussian nuclear charges in CASSCF gradients, which need libcint.

## Inconsistencies in forte2

These are places where forte2's own declarations disagree with its behavior. An exporter should fix
them in forte2 rather than reproduce them.

- **`gradient` is declared unevenly.** RHF and UHF add `"gradient"` to `provides`, but GHF,
  MCOptimizer, and FDGradient implement `gradient()` without declaring it. GeometryOptimizer checks
  `hasattr(parent, "gradient")` through `requires_attrs` instead of `requires`.
- **No method declares its energy.** FDGradient reads `parent.E` but requires only `system` and
  `mos`, so it binds to AVAS, which has no energy, and fails at run time. The catalog adds an
  `energy` fact.
- **Solver capabilities aren't checked at bind time.** DSRG after a selected-CI driver binds, then
  fails in `run()` with `order must be one of (1, 2), got 3`.
- **`root` means different things.** `FDGradient.root` indexes `E`, which every driver reports as a
  single energy, so any `root` above 0 raises. `GeometryOptimizer.root` indexes `E_ci`.
- **Three parent checks bypass the Method contract.** AVAS, ASET, and DSRG check their parent with
  `isinstance`, which `requires` and `requires_attrs` can't express.
- **`ms` defaults to `None` but is required.** UHF, ROHF, and CUHF raise unless it is set.
- **State-averaged CASSCF gradients need `final_orbitals="original"`**, but MCOptimizer defaults to
  `"semicanonical"`.
- **IAO and IBO are only in `forte2.orbitals`.** They aren't exported from `forte2`. `IBO` doesn't
  accept `j_adapt`, and `IAO`'s `j_adapt` has no docstring.
- **`MutualCorrelationAnalysis` documents the wrong argument.** It documents `solver` as an
  `ActiveSpaceSolver`, but it takes a driver.
- **`forte2/utils` has no `__init__.py`.**
