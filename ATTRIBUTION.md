# Attribution and provenance

## Publisher

- **Project:** Architecture Check (`@enwithai/architecture-check`), the fifth EnWithAI Engineering Commons tool.
- **Commons:** EnWithAI Engineering Commons. _Check the spec. Check the impact. Check the outcome._ Architecture Check
  adds: check that the architecture model still describes the code.
- **Copyright holder:** EnWithAI Technologies (as stated in [LICENSE](LICENSE)).
- **License:** MIT. It applies to all code, documentation, schemas and examples in this repository, except the
  test-only CALM schemas listed in [NOTICE.md](NOTICE.md).
- **Maintainer:** Koushik Ramani ([@aiwithrk](https://github.com/aiwithrk)), EnWithAI Technologies.
- **Contact:** [hello@enwithai.com](mailto:hello@enwithai.com)
- **Security issues:** see [SECURITY.md](SECURITY.md).

## Development provenance

Architecture Check was written for this repository, spec first (`docs/SPEC.md`, with expected findings written by
hand before the code). It was developed with substantial AI assistance (Claude Code). Commits carry a
`Co-Authored-By` trailer, and changes were directed and accepted by the project's human sponsor. Test fixtures and
demo data are synthetic.

## Built on

| Upstream                                                                  | Version                | License    | How Architecture Check uses it                                                                                     |
| ------------------------------------------------------------------------- | ---------------------- | ---------- | ------------------------------------------------------------------------------------------------------------------ |
| [Node.js](https://nodejs.org)                                             | 22 / 24 / ≥ 26         | MIT        | Runtime only                                                                                                       |
| [yaml](https://github.com/eemeli/yaml)                                    | 2.9.1                  | ISC        | Runtime dependency: safe YAML 1.2 parsing of compose files, Kubernetes manifests and API descriptions              |
| [Structurizr DSL](https://docs.structurizr.com/dsl)                       | language reference     | Apache-2.0 | A documented subset is read; DSL is written. No Structurizr code is used                                           |
| [FINOS CALM](https://calm.finos.org)                                      | 1.3                    | Apache-2.0 | CALM architecture documents are read and written; the 1.3 meta schemas validate the output in tests                |
| [C4 model](https://c4model.com)                                           | —                      | CC BY 4.0  | Vocabulary (system, container, component)                                                                          |
| [Impact Check](https://github.com/enwithai/impact-check)                  | ≥ 0.3.0                | MIT        | `impact-check graph` output is read as a file (D-081); 0.3.0 is a devDependency for the interoperability test only |
| [SARIF](https://docs.oasis-open.org/sarif/sarif/v2.1.0/sarif-v2.1.0.html) | 2.1.0 (OASIS standard) | —          | Output format                                                                                                      |

Development tools (Vitest, ESLint, typescript-eslint, Prettier, Ajv, TypeScript) are not distributed. Research and
design influences are in [REFERENCES.md](REFERENCES.md). Listing a project does not mean its maintainers endorse
Architecture Check.

## Frameworks

| Framework | Owner                  | Relationship   | Note                                                                                                                       |
| --------- | ---------------------- | -------------- | -------------------------------------------------------------------------------------------------------------------------- |
| CLEAR     | NetworkGain Consulting | `none`         | The drift rules and tri-state status are Architecture Check's own design, not a CLEAR method.                              |
| TRACE     | EnWithAI Technologies  | `not-assessed` | Architecture Check ties model elements to code with evidence. Alignment with TRACE cannot be stated until it is published. |

## Ecosystem

Architecture Check is independently usable. It has no dependency on CrewPE, any EnWithAI service or NetworkGain, and it
never uses the network. CrewPE is EnWithAI's enterprise engineering-lifecycle product; an enterprise-wide, continuously
updated architecture view is CrewPE's scope, not this tool's, and no integration exists today.

## Not affiliated

Architecture Check is not affiliated with, endorsed by or certified by FINOS, the CALM maintainers, Structurizr
Limited, the C4 model's author, OASIS, Anthropic or Google.
