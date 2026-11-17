resource "random_uuid" "ticket_scope" {}

resource "azuread_application" "api" {
  display_name     = "${local.gh_repo}-${local.func_name}-api"
  sign_in_audience = "AzureADMyOrg"
  owners           = [data.azurerm_client_config.current.object_id]

  api {
    requested_access_token_version = 2
    oauth2_permission_scope {
      id                         = random_uuid.ticket_scope.result
      value                      = "Tickets.ReadWrite"
      type                       = "User"
      enabled                    = true
      admin_consent_display_name = "Use mock support tickets"
      admin_consent_description  = "Read and change the demo's shared, ephemeral support tickets."
      user_consent_display_name  = "Use mock support tickets"
      user_consent_description   = "Read and change fictional support tickets as you."
    }
  }

  web {
    redirect_uris = []
  }

  lifecycle {
    # Preserve reply URLs potentially added by Copilot Studio tooling or another client.
    ignore_changes = [identifier_uris, web]
  }
}

resource "azuread_application_identifier_uri" "api" {
  application_id = azuread_application.api.id
  identifier_uri = "api://${azuread_application.api.client_id}"
}

resource "azuread_service_principal" "api" {
  client_id = azuread_application.api.client_id
}

resource "azuread_application" "connector" {
  display_name     = "${local.gh_repo}-${local.func_name}-connector"
  sign_in_audience = "AzureADMyOrg"
  owners           = [data.azurerm_client_config.current.object_id]

  web {
    redirect_uris = var.connector_redirect_uris
  }

  required_resource_access {
    resource_app_id = azuread_application.api.client_id
    resource_access {
      id   = random_uuid.ticket_scope.result
      type = "Scope"
    }
  }
}

resource "azuread_service_principal" "connector" {
  client_id = azuread_application.connector.client_id
}

resource "azuread_application_pre_authorized" "connector" {
  application_id       = azuread_application.api.id
  authorized_client_id = azuread_application.connector.client_id
  permission_ids       = [random_uuid.ticket_scope.result]
}

resource "azuread_application_federated_identity_credential" "connector" {
  count = var.connector_federation == null ? 0 : 1

  application_id = azuread_application.connector.id
  display_name   = "power-platform-connector"
  audiences      = ["api://AzureADTokenExchange"]
  issuer         = var.connector_federation.issuer
  subject        = var.connector_federation.subject
}

resource "azurerm_user_assigned_identity" "mcp" {
  name                = "mi-${local.func_name}"
  location            = azurerm_resource_group.this.location
  resource_group_name = azurerm_resource_group.this.name
  tags                = local.tags
}

resource "azurerm_role_assignment" "acr_pull" {
  scope                = azurerm_container_registry.this.id
  role_definition_name = "AcrPull"
  principal_id         = azurerm_user_assigned_identity.mcp.principal_id
}
