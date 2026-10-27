workspace "Shop" "Fixture A13: elements matched by name, only shared has commons.source" {
    !identifiers hierarchical

    model {
        customer = person "Customer"
        shop = softwareSystem "Shop" {
            web = container "Web" "Storefront" "Node.js" {
                properties {
                    "commons.allowed-dependencies" "shop.api"
                }
            }
            api = container "API" "Orders API" "Node.js" {
                orders = component "Orders" "Order handling" "TypeScript"
            }
            db = container "Database" "" "PostgreSQL"
            shared = container "Shared library" "Money helpers" "TypeScript" {
                properties {
                    "commons.source" "shared"
                }
            }
        }

        customer -> shop.web "Uses"
        shop.web -> shop.api "Calls"
        shop.api -> shop.db "Reads and writes"
    }
}
