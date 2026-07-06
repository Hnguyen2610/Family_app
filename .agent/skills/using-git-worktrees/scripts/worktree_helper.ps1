<#
.SYNOPSIS
    Manages Git Worktrees for Antigravity AI Agent workspaces on Windows.
.DESCRIPTION
    This script automates the creation, node_modules linking, and cleanup of Git Worktrees
    in the Temp folder directory to avoid workspace pollution.
.PARAMETER Action
    The action to perform: 'Add', 'Remove', or 'Cleanup'.
.PARAMETER BranchName
    The name of the branch to be created or deleted.
.PARAMETER WorktreeRoot
    The parent directory for temp worktrees. Defaults to C:\Users\jvb\AppData\Local\Temp\worktrees.
#>

[CmdletBinding()]
param (
    [Parameter(Mandatory = $true)]
    [ValidateSet('Add', 'Remove', 'Cleanup')]
    [string]$Action,

    [Parameter(Mandatory = $false)]
    [string]$BranchName,

    [Parameter(Mandatory = $false)]
    [string]$WorktreeRoot = "C:\Users\jvb\AppData\Local\Temp\worktrees"
)

# Set strict error handling
$ErrorActionPreference = "Stop"

# Resolve absolute path for WorktreeRoot
if (-not (Test-Path $WorktreeRoot)) {
    New-Item -ItemType Directory -Path $WorktreeRoot -Force | Out-Null
}
$WorktreeRoot = (Get-Item $WorktreeRoot).FullName

# Resolve absolute path of Main Repository Root (four levels up from script)
$RepoRoot = (Get-Item "$PSScriptRoot\..\..\..\..").FullName

Write-Host "=== Git Worktree Helper ==="
Write-Host "Action: $Action"
Write-Host "Main Repository Root: $RepoRoot"
Write-Host "Worktree Root Path: $WorktreeRoot"

# Helper function to safely delete junctions on Windows
function Remove-JunctionSafe {
    param (
        [string]$Path
    )
    if (Test-Path $Path) {
        Write-Host "Safely removing junction point at: $Path"
        # Using cmd /c rmdir is the safest way to delete junctions on Windows without deleting target content
        cmd.exe /c "rmdir `"$Path`"" 2>&1 | Out-Null
        if (Test-Path $Path) {
            # Fallback if cmd fails
            Remove-Item -Path $Path -Force -Recurse -ErrorAction SilentlyContinue
        }
    }
}

# Helper function to list active worktree directories
function Get-GitWorktrees {
    $worktrees = git worktree list --porcelain
    $paths = @()
    foreach ($line in $worktrees) {
        if ($line -like "worktree *") {
            $paths += ($line -replace "worktree ", "").Trim()
        }
    }
    return $paths
}

# Executing Actions
switch ($Action) {
    "Add" {
        if ([string]::IsNullOrEmpty($BranchName)) {
            Write-Error "BranchName is required for Add action."
        }
        
        $TargetPath = Join-Path $WorktreeRoot $BranchName
        Write-Host "Target worktree path: $TargetPath"

        # Check if worktree directory already exists
        if (Test-Path $TargetPath) {
            Write-Host "Target directory already exists. Performing cleanup..."
            Remove-JunctionSafe (Join-Path $TargetPath "frontend\node_modules")
            Remove-JunctionSafe (Join-Path $TargetPath "backend\node_modules")
            # Remove worktree from git registration if registered
            $registeredList = Get-GitWorktrees
            if ($registeredList -contains $TargetPath) {
                Write-Host "Removing registered worktree..."
                git worktree remove --force "$TargetPath"
            }
            Remove-Item -Path $TargetPath -Force -Recurse -ErrorAction SilentlyContinue
        }

        # Check if target branch exists (locally or remotely)
        $branchExists = $false
        $branches = git branch -a
        foreach ($b in $branches) {
            if ($b.Trim() -match "(^|\/)$BranchName$") {
                $branchExists = $true
                break
            }
        }

        # Add the git worktree
        Write-Host "Adding git worktree..."
        if ($branchExists) {
            Write-Host "Branch '$BranchName' already exists. Checking out existing branch."
            git worktree add "$TargetPath" "$BranchName"
        } else {
            Write-Host "Creating new branch '$BranchName' and checking out."
            git worktree add "$TargetPath" -b "$BranchName"
        }

        # Create Junctions for node_modules to avoid npm install overhead
        $modulesToLink = @(
            @{ SubPath = "frontend"; Name = "node_modules" },
            @{ SubPath = "backend"; Name = "node_modules" }
        )

        foreach ($module in $modulesToLink) {
            $sourceModules = Join-Path $RepoRoot (Join-Path $module.SubPath $module.Name)
            $targetParent = Join-Path $TargetPath $module.SubPath
            $targetModules = Join-Path $targetParent $module.Name

            if (Test-Path $sourceModules) {
                if (-not (Test-Path $targetParent)) {
                    New-Item -ItemType Directory -Path $targetParent -Force | Out-Null
                }
                Write-Host "Creating junction link from $sourceModules to $targetModules"
                # Using cmd /c mklink /j is highly compatible for junctions on Windows
                cmd.exe /c "mklink /j `"$targetModules`" `"$sourceModules`"" | Out-Null
            } else {
                Write-Warning "Source folder '$sourceModules' not found. Skipping junction creation."
            }
        }

        Write-Host "[OK] Worktree added successfully."
        Write-Host "PATH:$TargetPath"
    }

    "Remove" {
        if ([string]::IsNullOrEmpty($BranchName)) {
            Write-Error "BranchName is required for Remove action."
        }

        $TargetPath = Join-Path $WorktreeRoot $BranchName
        Write-Host "Target path to remove: $TargetPath"

        # Safely remove junction nodes first to avoid recursive deleting main node_modules
        Remove-JunctionSafe (Join-Path $TargetPath "frontend\node_modules")
        Remove-JunctionSafe (Join-Path $TargetPath "backend\node_modules")

        # Check if it is registered in git worktrees
        $registeredList = Get-GitWorktrees
        if ($registeredList -contains $TargetPath) {
            Write-Host "Removing worktree registration..."
            git worktree remove --force "$TargetPath"
        }

        # Delete folders remaining
        if (Test-Path $TargetPath) {
            Write-Host "Deleting residual directory files..."
            Remove-Item -Path $TargetPath -Force -Recurse -ErrorAction SilentlyContinue
        }

        # Prune worktree metadata is always safe
        git worktree prune
        Write-Host "[OK] Worktree removed successfully."
    }

    "Cleanup" {
        Write-Host "Cleaning up untracked or orphaned worktrees in $WorktreeRoot..."
        git worktree prune

        $registeredWorktrees = Get-GitWorktrees
        $directories = Get-ChildItem -Path $WorktreeRoot -Directory

        foreach ($dir in $directories) {
            $dirPath = $dir.FullName
            if ($registeredWorktrees -notcontains $dirPath) {
                Write-Host "Orphaned worktree directory found: $dirPath. Cleaning up..."
                Remove-JunctionSafe (Join-Path $dirPath "frontend\node_modules")
                Remove-JunctionSafe (Join-Path $dirPath "backend\node_modules")
                Remove-Item -Path $dirPath -Force -Recurse -ErrorAction SilentlyContinue
                Write-Host "Deleted orphaned directory: $dirPath"
            }
        }
        Write-Host "[OK] Cleanup completed."
    }
}
