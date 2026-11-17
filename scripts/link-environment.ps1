[CmdletBinding(SupportsShouldProcess)]
param(
    [Parameter(Mandatory)]
    [ValidateNotNullOrEmpty()]
    [string]$EnvironmentId
)

$ErrorActionPreference = 'Stop'
Import-Module Microsoft.PowerPlatform.EnterprisePolicies -ErrorAction Stop
$terraformDirectory = Join-Path $PSScriptRoot '../terraform'
$policyId = & terraform "-chdir=$terraformDirectory" output -raw enterprise_policy_id
if ($LASTEXITCODE -ne 0) { throw 'Unable to read the Terraform enterprise policy output.' }
if ($PSCmdlet.ShouldProcess($EnvironmentId, "Associate enterprise policy $policyId")) {
    Enable-SubnetInjection -EnvironmentId $EnvironmentId -PolicyArmId $policyId
}
