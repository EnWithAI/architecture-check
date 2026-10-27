workspace "As-built system" "Derived by Architecture Check from static evidence. Review before adopting it as the declared model." {
    !identifiers hierarchical

    model {
        system = softwareSystem "As-built system" {
            api = container "api" "api/Dockerfile, docker-compose.yml" "Node.js" {
                properties {
                    "commons.source" "api"
                }
            }
            db = container "db" "docker-compose.yml" "PostgreSQL" {
                properties {
                    "commons.source" "db"
                }
            }
            web = container "web" "docker-compose.yml, web/Dockerfile" "Node.js" {
                properties {
                    "commons.source" "web"
                }
            }
        }

        system.api -> system.db "depends_on, env DATABASE_URL"
        system.web -> system.api "depends_on"
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
