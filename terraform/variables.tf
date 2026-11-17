variable "subscription_id" {
  type      = string
  sensitive = true
}

variable "location" {
  type        = string
  description = "Primary Azure region matching the Power Platform environment region pair."
  default     = "eastus"
}

variable "secondary_location" {
  type        = string
  description = "Second required Azure region. Use null or an empty string only for a supported single-region geography."
  default     = "westus"
  nullable    = true
}

variable "power_platform_geo" {
  type        = string
  description = "Enterprise policy geography, not an Azure region."
  default     = "unitedstates"
}

variable "gh_repo" {
  type        = string
  description = "Repository in owner/name form, used for naming and tags."
  default     = "implodingduck/copilot-studio-private-mcp"

  validation {
    condition     = can(regex("^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$", var.gh_repo))
    error_message = "Use a GitHub repository in owner/name form."
  }
}

variable "mcp_image_uri" {
  type        = string
  description = "Immutable ACR image URI. Blank creates the platform without the app."
  default     = ""

  validation {
    condition     = var.mcp_image_uri == "" || can(regex("^[a-z0-9.-]+\\.azurecr\\.io/[a-z0-9/._-]+@sha256:[0-9a-f]{64}$", var.mcp_image_uri))
    error_message = "Use an immutable ACR image URI ending in @sha256:<64 hex characters>."
  }
}

variable "connector_redirect_uris" {
  type        = list(string)
  description = "Exact redirect URL(s) generated after saving the custom connector."
  default     = []

  validation {
    condition     = alltrue([for uri in var.connector_redirect_uris : can(regex("^https://[^/?#]+/[^?#]*$", uri))])
    error_message = "Use complete HTTPS callback URLs without query strings."
  }
}

variable "connector_federation" {
  type = object({
    issuer  = string
    subject = string
  })
  description = "Optional issuer and subject from the custom connector's managed identity authentication settings."
  default     = null

  validation {
    condition     = var.connector_federation == null ? true : startswith(var.connector_federation.issuer, "https://") && length(var.connector_federation.subject) > 0
    error_message = "Provide an HTTPS issuer and nonempty subject from the connector."
  }
}

variable "power_platform_admin_object_ids" {
  type        = set(string)
  description = "Optional Entra principal object IDs needing Reader access to associate the enterprise policy."
  default     = []
}
