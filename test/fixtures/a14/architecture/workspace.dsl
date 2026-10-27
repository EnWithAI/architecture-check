workspace "Orders" {
    !identifiers hierarchical
    model {
        orders = softwareSystem "Orders" {
            api = container "API" "" "" {
                properties {
                    "commons.source" "api"
                }
            }
            database = container "Database" "" "PostgreSQL" {
                properties {
                    "commons.source" "postgres"
                }
            }
        }
    }
}
