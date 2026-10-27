workspace "Shop" "Fixture A1" {
    !identifiers hierarchical

    model {
        customer = person "Customer"
        shop = softwareSystem "Shop" {
            web = container "Web" "Storefront" "Node.js" {
                properties {
                    "commons.source" "web"
                }
            }
            api = container "API" "Orders API" "Node.js" {
                properties {
                    "commons.source" "api"
                }
            }
            db = container "Database" "" "PostgreSQL" {
                properties {
                    "commons.source" "db"
                }
            }
        }

        payments = softwareSystem "Stripe" "Card payments" "External" {
            properties {
                "commons.source" "stripe"
            }
        }

        customer -> shop.web "Uses"
        shop.web -> shop.api "Calls"
        shop.api -> shop.db "Reads and writes"
        shop.api -> payments "Charges cards"
    }

    views {
        systemContext shop {
            include *
            autolayout lr
        }
    }
}
