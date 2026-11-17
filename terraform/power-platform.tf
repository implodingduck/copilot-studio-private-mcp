resource "azapi_resource" "enterprise_policy" {
  type      = "Microsoft.PowerPlatform/enterprisePolicies@2020-10-30-preview"
  name      = "ep-${local.func_name}"
  parent_id = azurerm_resource_group.this.id
  location  = var.power_platform_geo
  tags      = local.tags

  body = {
    kind = "NetworkInjection"
    properties = {
      networkInjection = {
        virtualNetworks = [for key in sort(keys(local.networks)) : {
          id     = azurerm_virtual_network.this[key].id
          subnet = { name = azurerm_subnet.power_platform[key].name }
        }]
      }
    }
  }

  depends_on = [
    azurerm_subnet_nat_gateway_association.power_platform,
    azurerm_nat_gateway_public_ip_association.this,
    azurerm_virtual_network_peering.primary_to_secondary,
    azurerm_virtual_network_peering.secondary_to_primary,
  ]
}

resource "azurerm_role_assignment" "enterprise_policy_reader" {
  for_each = var.power_platform_admin_object_ids

  scope                = azapi_resource.enterprise_policy.id
  role_definition_name = "Reader"
  principal_id         = each.value
}
