mock_provider "azurerm" {
  mock_data "azurerm_client_config" {
    defaults = {
      tenant_id = "11111111-1111-4111-8111-111111111111"
      object_id = "22222222-2222-4222-8222-222222222222"
    }
  }
}
mock_provider "azuread" {}
mock_provider "azapi" {}
mock_provider "random" {}

variables {
  subscription_id = "00000000-0000-0000-0000-000000000000"
  mcp_image_uri   = ""
}

run "paired_region_private_platform" {
  command = plan

  assert {
    condition     = length(azurerm_subnet.power_platform) == 2 && length(azurerm_virtual_network_peering.primary_to_secondary) == 1
    error_message = "US requires delegated subnets in two regions and private routing between them."
  }
  assert {
    condition     = azurerm_container_app_environment.this.internal_load_balancer_enabled && azurerm_container_app_environment.this.public_network_access == "Disabled"
    error_message = "The MCP environment must never expose public ingress."
  }
  assert {
    condition     = length(azurerm_private_dns_zone_virtual_network_link.this) == 2
    error_message = "Both Power Platform regions must resolve the private app domain."
  }
  assert {
    condition     = length(azurerm_container_app.this) == 0
    error_message = "The bootstrap apply must not need a placeholder/public image."
  }
}

run "single_region_private_platform" {
  command = plan
  variables {
    power_platform_geo = "brazil"
    location           = "brazilsouth"
    secondary_location = null
  }
  assert {
    condition     = length(azurerm_subnet.power_platform) == 1 && length(azurerm_virtual_network_peering.primary_to_secondary) == 0
    error_message = "Single-region geographies must not require a fictitious paired region."
  }
}

run "single_region_empty_environment_value" {
  command = plan
  variables {
    power_platform_geo = "brazil"
    location           = "brazilsouth"
    secondary_location = ""
  }
  assert {
    condition     = length(azurerm_subnet.power_platform) == 1 && length(azurerm_virtual_network_peering.primary_to_secondary) == 0
    error_message = "An empty secondary region must support TF_VAR_secondary_location for single-region geographies."
  }
}

run "reject_missing_us_pair" {
  command = plan
  variables {
    secondary_location = null
  }
  expect_failures = [azurerm_resource_group.this]
}

run "reject_mismatched_geography" {
  command = plan
  variables {
    power_platform_geo = "europe"
  }
  expect_failures = [azurerm_resource_group.this]
}

run "single_replica_authenticated_app" {
  command = plan
  variables {
    mcp_image_uri = "example.azurecr.io/support-tickets@sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
  }
  assert {
    condition     = azurerm_container_app.this[0].template[0].min_replicas == 1 && azurerm_container_app.this[0].template[0].max_replicas == 1
    error_message = "In-memory state requires one warm replica."
  }
  assert {
    condition     = !azurerm_container_app.this[0].ingress[0].allow_insecure_connections
    error_message = "Only HTTPS may enter the private app."
  }
  assert {
    condition     = contains([for env in azurerm_container_app.this[0].template[0].container[0].env : "${env.name}=${env.value}"], "AUTH_MODE=entra")
    error_message = "Deployed containers must enforce Entra authentication."
  }
}
