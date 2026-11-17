resource "azurerm_container_app_environment" "this" {
  name                               = "cae-${local.func_name}"
  location                           = azurerm_resource_group.this.location
  resource_group_name                = azurerm_resource_group.this.name
  log_analytics_workspace_id         = azurerm_log_analytics_workspace.this.id
  infrastructure_subnet_id           = azurerm_subnet.container_apps.id
  infrastructure_resource_group_name = "ME_cae-${local.func_name}"
  internal_load_balancer_enabled     = true
  public_network_access              = "Disabled"
  tags                               = local.tags

  workload_profile {
    name                  = "Consumption"
    workload_profile_type = "Consumption"
    minimum_count         = 0
    maximum_count         = 0
  }

  depends_on = [
    azurerm_subnet_nat_gateway_association.container_apps,
    azurerm_nat_gateway_public_ip_association.this,
  ]
}

resource "azurerm_container_app" "this" {
  count = local.deploy_mcp ? 1 : 0

  name                         = local.app_name
  resource_group_name          = azurerm_resource_group.this.name
  container_app_environment_id = azurerm_container_app_environment.this.id
  revision_mode                = "Single"
  workload_profile_name        = "Consumption"
  tags                         = local.tags

  identity {
    type         = "UserAssigned"
    identity_ids = [azurerm_user_assigned_identity.mcp.id]
  }

  registry {
    server   = azurerm_container_registry.this.login_server
    identity = azurerm_user_assigned_identity.mcp.id
  }

  # "External" means outside the ACA environment, still behind its private ILB.
  ingress {
    external_enabled           = true
    allow_insecure_connections = false
    target_port                = 8080
    transport                  = "http"
    traffic_weight {
      latest_revision = true
      percentage      = 100
    }
  }

  template {
    min_replicas = 1
    max_replicas = 1
    container {
      name   = "mcp"
      image  = var.mcp_image_uri
      cpu    = 0.5
      memory = "1Gi"

      dynamic "env" {
        for_each = {
          HOST                      = "0.0.0.0"
          PORT                      = "8080"
          AUTH_MODE                 = "entra"
          ALLOWED_HOSTS             = local.mcp_host
          ENTRA_TENANT_ID           = data.azurerm_client_config.current.tenant_id
          ENTRA_API_CLIENT_ID       = azuread_application.api.client_id
          ENTRA_CONNECTOR_CLIENT_ID = azuread_application.connector.client_id
        }
        content {
          name  = env.key
          value = env.value
        }
      }

      liveness_probe {
        transport = "HTTP"
        port      = 8080
        path      = "/healthz"
      }
      readiness_probe {
        transport = "HTTP"
        port      = 8080
        path      = "/healthz"
      }
      startup_probe {
        transport               = "HTTP"
        port                    = 8080
        path                    = "/healthz"
        failure_count_threshold = 30
        interval_seconds        = 5
      }
    }
  }

  depends_on = [
    azurerm_role_assignment.acr_pull,
    azuread_application_identifier_uri.api,
    azuread_application_pre_authorized.connector,
    azurerm_private_dns_zone_virtual_network_link.this,
    azurerm_private_dns_a_record.this,
  ]
}
