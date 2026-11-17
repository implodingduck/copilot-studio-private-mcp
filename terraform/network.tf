resource "azurerm_virtual_network" "this" {
  for_each = local.networks

  name                = "vnet-${local.func_name}-${each.key}"
  location            = each.value.location
  resource_group_name = azurerm_resource_group.this.name
  address_space       = [each.value.address_space]
  tags                = local.tags
}

resource "azurerm_subnet" "power_platform" {
  for_each = local.networks

  name                            = "power-platform"
  resource_group_name             = azurerm_resource_group.this.name
  virtual_network_name            = azurerm_virtual_network.this[each.key].name
  address_prefixes                = [each.value.power_platform_subnet]
  default_outbound_access_enabled = false

  delegation {
    name = "power-platform"
    service_delegation {
      name    = "Microsoft.PowerPlatform/enterprisePolicies"
      actions = ["Microsoft.Network/virtualNetworks/subnets/join/action"]
    }
  }
}

resource "azurerm_subnet" "container_apps" {
  name                            = "container-apps"
  resource_group_name             = azurerm_resource_group.this.name
  virtual_network_name            = azurerm_virtual_network.this["primary"].name
  address_prefixes                = ["10.70.0.0/23"]
  default_outbound_access_enabled = false

  delegation {
    name = "container-apps"
    service_delegation {
      name    = "Microsoft.App/environments"
      actions = ["Microsoft.Network/virtualNetworks/subnets/join/action"]
    }
  }
}

resource "azurerm_public_ip" "egress" {
  for_each = local.networks

  name                = "pip-${local.func_name}-${each.key}-egress"
  location            = each.value.location
  resource_group_name = azurerm_resource_group.this.name
  allocation_method   = "Static"
  sku                 = "Standard"
  tags                = local.tags

  lifecycle {
    # Some subscriptions inject FirstPartyUsage; it is managed by Azure, not this demo.
    ignore_changes = [ip_tags]
  }
}

resource "azurerm_nat_gateway" "this" {
  for_each = local.networks

  name                = "nat-${local.func_name}-${each.key}"
  location            = each.value.location
  resource_group_name = azurerm_resource_group.this.name
  sku_name            = "Standard"
  tags                = local.tags
}

resource "azurerm_nat_gateway_public_ip_association" "this" {
  for_each = local.networks

  nat_gateway_id       = azurerm_nat_gateway.this[each.key].id
  public_ip_address_id = azurerm_public_ip.egress[each.key].id
}

resource "azurerm_subnet_nat_gateway_association" "power_platform" {
  for_each = local.networks

  subnet_id      = azurerm_subnet.power_platform[each.key].id
  nat_gateway_id = azurerm_nat_gateway.this[each.key].id
}

resource "azurerm_subnet_nat_gateway_association" "container_apps" {
  subnet_id      = azurerm_subnet.container_apps.id
  nat_gateway_id = azurerm_nat_gateway.this["primary"].id
}

resource "azurerm_virtual_network_peering" "primary_to_secondary" {
  count = local.secondary_location == null ? 0 : 1

  name                         = "primary-to-secondary"
  resource_group_name          = azurerm_resource_group.this.name
  virtual_network_name         = azurerm_virtual_network.this["primary"].name
  remote_virtual_network_id    = azurerm_virtual_network.this["secondary"].id
  allow_virtual_network_access = true
}

resource "azurerm_virtual_network_peering" "secondary_to_primary" {
  count = local.secondary_location == null ? 0 : 1

  name                         = "secondary-to-primary"
  resource_group_name          = azurerm_resource_group.this.name
  virtual_network_name         = azurerm_virtual_network.this["secondary"].name
  remote_virtual_network_id    = azurerm_virtual_network.this["primary"].id
  allow_virtual_network_access = true
}

resource "azurerm_private_dns_zone" "this" {
  name                = azurerm_container_app_environment.this.default_domain
  resource_group_name = azurerm_resource_group.this.name
  tags                = local.tags
}

resource "azurerm_private_dns_a_record" "this" {
  for_each = toset(["@", "*"])

  name                = each.value
  zone_name           = azurerm_private_dns_zone.this.name
  resource_group_name = azurerm_resource_group.this.name
  ttl                 = 60
  records             = [azurerm_container_app_environment.this.static_ip_address]
}

resource "azurerm_private_dns_zone_virtual_network_link" "this" {
  for_each = local.networks

  name                  = "link-${each.key}"
  resource_group_name   = azurerm_resource_group.this.name
  private_dns_zone_name = azurerm_private_dns_zone.this.name
  virtual_network_id    = azurerm_virtual_network.this[each.key].id
  registration_enabled  = false
  tags                  = local.tags
}
