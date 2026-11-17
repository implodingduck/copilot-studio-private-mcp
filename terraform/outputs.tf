output "subscription_id" {
  value     = var.subscription_id
  sensitive = true
}

output "resource_group_name" {
  value = azurerm_resource_group.this.name
}

output "registry_name" {
  value = azurerm_container_registry.this.name
}

output "registry_login_server" {
  value = azurerm_container_registry.this.login_server
}

output "container_app_name" {
  value = local.app_name
}

output "mcp_endpoint" {
  description = "Private HTTPS endpoint; reachable only with network and private DNS access."
  value       = "https://${local.mcp_host}/mcp"
}

output "internal_ip_address" {
  value = azurerm_container_app_environment.this.static_ip_address
}

output "private_dns_zone" {
  value = azurerm_private_dns_zone.this.name
}

output "log_analytics_workspace_id" {
  value = azurerm_log_analytics_workspace.this.workspace_id
}

output "enterprise_policy_id" {
  value = azapi_resource.enterprise_policy.id
}

output "virtual_network_ids" {
  value = { for key, network in azurerm_virtual_network.this : key => network.id }
}

output "connector_settings" {
  value = {
    tenant_id         = data.azurerm_client_config.current.tenant_id
    client_id         = azuread_application.connector.client_id
    application_id    = azuread_application.connector.object_id
    api_client_id     = azuread_application.api.client_id
    resource_url      = azuread_application_identifier_uri.api.identifier_uri
    scope             = "${azuread_application_identifier_uri.api.identifier_uri}/Tickets.ReadWrite"
    authorization_url = "https://login.microsoftonline.com/${data.azurerm_client_config.current.tenant_id}/oauth2/v2.0/authorize"
    token_url         = "https://login.microsoftonline.com/${data.azurerm_client_config.current.tenant_id}/oauth2/v2.0/token"
  }
}
