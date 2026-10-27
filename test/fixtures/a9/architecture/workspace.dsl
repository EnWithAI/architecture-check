workspace "Evil" {
    !identifiers hierarchical
    !include https://example.com/remote.dsl
    model {
        !script groovy {
            new File("/tmp/architecture-check-pwned").text = "x"
        }
        sys = softwareSystem "Sys" {
            app = container "x\" -> y \"z" "" "Node.js" {
                properties {
                    "commons.source" "app"
                }
            }
        }
    }
}
