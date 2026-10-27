workspace "As-built system" "Derived by Architecture Check from static evidence. Review before adopting it as the declared model." {
    !identifiers hierarchical

    model {
        system = softwareSystem "As-built system" {
            api = container "api" "api/Dockerfile, docker-compose.yml" "Node.js" {
                properties {
                    "commons.source" "api"
                }
                orders = component "orders" "" "" {
                    properties {
                        "commons.source" "api/src/orders"
                    }
                }
                payments = component "payments" "" "" {
                    properties {
                        "commons.source" "api/src/payments"
                    }
                }
            }
            db = container "db" "docker-compose.yml" "PostgreSQL" {
                properties {
                    "commons.source" "db"
                }
            }
            shop_shared = container "@shop/shared" "Workspace package" "" {
                properties {
                    "commons.source" "shared"
                }
            }
            web = container "web" "docker-compose.yml, web/Dockerfile" "Node.js" {
                properties {
                    "commons.source" "web"
                }
                cart = component "cart" "" "" {
                    properties {
                        "commons.source" "web/src/cart"
                    }
                }
            }
        }
        stripe = softwareSystem "Stripe" "npm: stripe" "External" {
            properties {
                "commons.source" "stripe"
            }
        }

        system.api -> system.db "depends_on, env DATABASE_URL"
        system.api.orders -> system.api.payments "imports"
        system.api.orders -> system.shop_shared "imports"
        system.api.payments -> stripe "imports"
        system.web -> system.api "depends_on, imports"
        system.web.cart -> system.shop_shared "imports"
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
