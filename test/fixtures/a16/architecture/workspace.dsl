workspace "Shop" "Fixture A16: a context-level model with no containers" {
    !identifiers hierarchical

    model {
        customer = person "Customer"
        shop = softwareSystem "Shop"

        customer -> shop "Buys from"
    }
}
