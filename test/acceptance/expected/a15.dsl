workspace "As-built system" "Derived by Architecture Check from static evidence. Review before adopting it as the declared model." {
    !identifiers hierarchical

    model {
        system = softwareSystem "As-built system" {
            acme_ledger = container "@acme/ledger" "Root package" "" {
                properties {
                    "commons.source" "."
                }
                cli = component "cli" "" "" {
                    properties {
                        "commons.source" "src/cli"
                    }
                }
                core = component "core" "" "" {
                    properties {
                        "commons.source" "src/core"
                    }
                }
            }
        }

        system.acme_ledger.cli -> system.acme_ledger.core "imports"
    }

    views {
        systemContext system {
            include *
            autolayout lr
        }
        container system {
            include *
            autolayout lr
        }
    }
}
