locals {
  func_name          = "mcp${random_string.unique.result}"
  loc_for_naming     = lower(replace(var.location, " ", ""))
  gh_repo            = split("/", var.gh_repo)[1]
  app_name           = "ca-${local.func_name}"
  mcp_host           = "${local.app_name}.${azurerm_container_app_environment.this.default_domain}"
  deploy_mcp         = var.mcp_image_uri != ""
  secondary_location = var.secondary_location == "" ? null : var.secondary_location

  networks = merge({
    primary = { location = var.location, address_space = "10.70.0.0/16", power_platform_subnet = "10.70.2.0/24" }
    }, local.secondary_location == null ? {} : {
    secondary = { location = local.secondary_location, address_space = "10.71.0.0/16", power_platform_subnet = "10.71.2.0/24" }
  })

  # Match the documented geography pairs; this demo targets Azure commercial cloud.
  geography_regions = {
    unitedstates = ["eastus", "westus"]
    southafrica  = ["southafricanorth", "southafricawest"]
    uk           = ["uksouth", "ukwest"]
    japan        = ["japaneast", "japanwest"]
    india        = ["centralindia", "southindia"]
    france       = ["francecentral", "francesouth"]
    europe       = ["westeurope", "northeurope"]
    germany      = ["germanynorth", "germanywestcentral"]
    switzerland  = ["switzerlandnorth", "switzerlandwest"]
    canada       = ["canadacentral", "canadaeast"]
    brazil       = ["brazilsouth"]
    australia    = ["australiasoutheast", "australiaeast"]
    asia         = ["eastasia", "southeastasia"]
    uae          = ["uaenorth", "uaecentral"]
    korea        = ["koreasouth", "koreacentral"]
    norway       = ["norwaywest", "norwayeast"]
    singapore    = ["southeastasia"]
    sweden       = ["swedencentral"]
    italy        = ["italynorth"]
  }

  tags = {
    managed_by = "terraform"
    repo       = local.gh_repo
    workload   = "private-support-mcp"
  }
}
