param(
  [Parameter(Mandatory = $true)]
  [string] $Root
)

$ErrorActionPreference = 'Stop'
$rootItem = Get-Item -LiteralPath $Root -Force
$targets = @($rootItem)
if ($rootItem.PSIsContainer) {
  $targets += @(Get-ChildItem -LiteralPath $rootItem.FullName -Force -Recurse)
}

$result = foreach ($target in $targets) {
  $acl = Get-Acl -LiteralPath $target.FullName
  $rules = foreach ($rule in $acl.Access) {
    $sid = $rule.IdentityReference.Translate([System.Security.Principal.SecurityIdentifier])
    [ordered]@{
      sid = $sid.Value
      rights = [int64]$rule.FileSystemRights
      accessType = [string]$rule.AccessControlType
      inherited = [bool]$rule.IsInherited
    }
  }
  [ordered]@{
    target = [System.IO.Path]::GetFullPath($target.FullName)
    inheritanceProtected = [bool]$acl.AreAccessRulesProtected
    rules = @($rules)
  }
}

ConvertTo-Json -InputObject @($result) -Depth 5 -Compress
