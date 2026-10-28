workspace "Ledger" "Fixture A15: a single-package repository" {
    !identifiers hierarchical

    model {
        ledger = softwareSystem "Ledger" {
            app = container "Ledger" "Command-line ledger" "Node.js" {
                properties {
                    "commons.source" "."
                }
                core = component "Core" {
                    properties {
                        "commons.source" "src/core"
                    }
                }
            }
        }
    }
}
