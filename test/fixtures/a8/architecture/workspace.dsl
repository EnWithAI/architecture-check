workspace "Shop" {
    !identifiers hierarchical
    model {
        shop = softwareSystem "Shop" {
            web = container "Web" "" "Node.js" {
                properties {
                    "commons.source" "web"
                }
            }
        }
    }
}
