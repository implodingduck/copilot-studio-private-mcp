terraform {
  required_version = ">= 1.11.0"

  required_providers {
    azurerm = {
      source  = "hashicorp/azurerm"
      version = "=4.67.0"
    }
    random = {
      source  = "hashicorp/random"
      version = "=3.1.0"
    }
    azapi = {
      source  = "azure/azapi"
      version = "=2.13.0"
    }
    azuread = {
      source  = "hashicorp/azuread"
      version = "=3.6.0"
    }
  }
}

provider "azurerm" {
  features {}
  subscription_id                 = var.subscription_id
  resource_provider_registrations = "none"
}

provider "azapi" {
  subscription_id = var.subscription_id
}

provider "azuread" {
  tenant_id = data.azurerm_client_config.current.tenant_id
}

data "azurerm_client_config" "current" {}
