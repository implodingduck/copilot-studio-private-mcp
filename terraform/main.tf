resource "random_string" "unique" {
  length  = 6
  special = false
  upper   = false
}

resource "azurerm_resource_group" "this" {
  name     = "rg-${local.gh_repo}-${random_string.unique.result}-${local.loc_for_naming}"
  location = var.location
  tags     = local.tags

  lifecycle {
    precondition {
      condition = toset(compact([var.location, local.secondary_location])) == toset(
        lookup(local.geography_regions, var.power_platform_geo, [])
      ) && (local.secondary_location == null || var.location != local.secondary_location)
      error_message = "Choose the documented Azure region(s) for power_platform_geo. Paired geographies require two distinct regions; single-region geographies require secondary_location = null or an empty string."
    }
  }
}

resource "azurerm_log_analytics_workspace" "this" {
  name                = "log-${local.func_name}"
  location            = azurerm_resource_group.this.location
  resource_group_name = azurerm_resource_group.this.name
  sku                 = "PerGB2018"
  retention_in_days   = 30
  tags                = local.tags
}

resource "azurerm_container_registry" "this" {
  name                = "acr${local.func_name}"
  location            = azurerm_resource_group.this.location
  resource_group_name = azurerm_resource_group.this.name
  sku                 = "Basic"
  admin_enabled       = false
  tags                = local.tags
}
